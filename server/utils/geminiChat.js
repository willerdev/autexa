import { FunctionCallingMode, GoogleGenerativeAI } from '@google/generative-ai';
import { takeBillPreviewForChatResponse } from '../src/lib/bookingBillPreview.js';
import { buildUserContext } from './buildUserContext.js';
import { TOOL_DEFINITIONS, TOOL_EXECUTORS } from './aiTools.js';
import { EMIT_CHAT_WIDGETS_TOOL } from './aiChatWidgets.js';
import { inferFallbackWidgetsFromText } from './inferChatWidgets.js';

function getKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured on the server');
  return key;
}

function extractFunctionCalls(result) {
  const parts = result?.response?.candidates?.[0]?.content?.parts ?? [];
  const calls = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      calls.push(p.functionCall);
    }
  }
  return calls;
}

function normalizeArgs(call) {
  const raw = call.args && typeof call.args === 'object' ? { ...call.args } : {};
  return raw;
}

const GEMINI_SEND_TIMEOUT_MS = Number(process.env.GEMINI_SEND_TIMEOUT_MS || 120000);
const GEMINI_HISTORY_TIMEOUT_MS = Number(process.env.GEMINI_HISTORY_TIMEOUT_MS || 15000);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function isRetriableGeminiError(err) {
  const msg = String(err?.message || '');
  return (
    /503/i.test(msg) ||
    /service unavailable/i.test(msg) ||
    /high demand/i.test(msg) ||
    /temporarily/i.test(msg) ||
    /rate limit/i.test(msg) ||
    /429/i.test(msg)
  );
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function getModelFallbacks() {
  const preferred = (process.env.GEMINI_TOOLS_MODEL || process.env.GEMINI_MODEL || '').trim();
  const extra = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest'];
  return Array.from(new Set([preferred || 'gemini-flash-latest', ...extra, ...defaults])).filter(Boolean);
}

/** Avoid hanging forever if the SDK never settles (seen after tool rounds). */
function extractAssistantText(result) {
  try {
    const t = result?.response?.text?.();
    if (typeof t === 'string' && t.trim()) return t.trim();
  } catch (e) {
    console.warn('[Gemini] response.text() failed, using parts fallback:', e?.message || e);
  }
  const parts = result?.response?.candidates?.[0]?.content?.parts ?? [];
  const chunks = [];
  for (const p of parts) {
    if (typeof p?.text === 'string' && p.text) chunks.push(p.text);
  }
  return chunks.join('').trim();
}

/**
 * Gemini function-calling loop: tools fetch real DB rows, model answers from results.
 *
 * @param {object} opts
 * @param {string} opts.userMessage
 * @param {string} opts.userId  Authenticated user id — overrides tool user_id args
 * @param {import('@google/generative-ai').Content[]} [opts.conversationHistory]
 */
export async function runGeminiChat({ userMessage, userId, conversationHistory = [] }) {
  let capturedWidgets = null;
  let userMemorySnippet = '';
  try {
    const ctx = await buildUserContext(userId);
    userMemorySnippet = `

--- USER MEMORY SNAPSHOT (may be stale — call get_wallet_balance / list_wallet_payees before spending) ---
${JSON.stringify({
      wallet: ctx.wallet,
      savedPayees: (ctx.savedPayees ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        provider_name: p.provider_name ?? undefined,
      })),
      walletMemoryNotes: ctx.walletMemory?.trim() ? String(ctx.walletMemory).trim().slice(0, 500) : undefined,
      preferredPayment: ctx.preferredPayment?.trim() ? ctx.preferredPayment : undefined,
      learnedMemories: Array.isArray(ctx.learnedMemories)
        ? ctx.learnedMemories.map((m) => ({
            id: m.id,
            text: String(m.body ?? '').slice(0, 500),
            createdAt: m.createdAt,
          }))
        : [],
    })}
`;
  } catch (e) {
    console.error('[runGeminiChat] buildUserContext', e);
  }

  async function runWithModel(modelName) {
    const genAI = new GoogleGenerativeAI(getKey());
    const model = genAI.getGenerativeModel(
      {
        model: modelName,
        systemInstruction: `
You are Gearup's AI assistant — an intelligent service booking helper for many verticals (automotive, food, cleaning, and anything providers list).
The authenticated user's ID is: ${userId}
Today's date is: ${new Date().toDateString()} (${new Date().toISOString().slice(0, 10)})
${userMemorySnippet}

CORE BEHAVIOUR:
- You have live backend tools (function calls) for bookings, wallet, cars, providers, and Uganda SMS via send_uganda_sms. Do not tell the user you cannot do something those tools support — follow the tool workflow (collect details, confirm when required, then call the tool).
- You can help users book ANY service type providers have posted — not only cars.
- NEVER assume a service does not exist. Use discover_services first when the user asks what is available or whether you offer something.
- NEVER invent menus, prices, or listings. Use get_service_details and discover_services for real data.
- NEVER guess booking rules for a type. Use get_service_type_schema before slot-filling.
- Use get_user_preferences to personalise (usual order, dietary notes, preferred times) when relevant.

DYNAMIC FLOW (typical):
1) DISCOVER — discover_services when exploring availability.
2) DETAILS — get_service_details when they pick or name a specific listing.
3) SCHEMA — get_service_type_schema for required/optional booking fields.
4) PREFERENCES — get_user_preferences to suggest repeats or shortcuts.
5) COLLECT — ask only what the schema requires, in small groups.
6) CONFIRM — show a full summary; never call create_dynamic_booking until the user clearly confirms.
6b) BILL PREVIEW — before create_dynamic_booking, you MUST call preview_booking_bill with the exact same booking fields (provider_service_id, provider_id, service_name, booking_date, booking_time, estimated_total, etc.). That generates a bill image in chat (Imagen) so the customer can review. If image generation fails, still complete preview_booking_bill so a text summary can be shown; explain any error briefly.
7) BOOK — only after preview_booking_bill succeeded for this booking, call create_dynamic_booking with the same details. The server rejects create without a matching preview.
8) MANAGE — cancel_user_bookings (bulk OK) after explicit confirmation; update_user_booking for reschedule; delete_user_car only after explicit confirmation. Always use get_user_bookings first to resolve ids.
9) LEARN — save_user_preferences after success or when they state stable likes/dislikes (no card numbers, no passwords).
9b) LONG-TERM CHAT MEMORY — You receive learnedMemories (id + text) in the snapshot. Use save_learned_memory after the user explicitly confirms a durable preference or correction. Use forget_learned_memory with the matching id if they say a saved line is wrong. Never store payment card numbers, passwords, PINs, or national IDs.

10) OUTBOUND SMS (Uganda only, tool: send_uganda_sms) — multi-turn by default; use natural language to infer intent and slot-fill.
- Triggers include: "send an sms", "text someone", "message [person]", "notify them by sms", etc.
- NEVER call send_uganda_sms in the same turn as the user only expressing vague intent (e.g. "I want to send a text") with no recipient and/or no message body. Ask what's missing instead.
- COLLECT (use conversation; one or two short questions):
  • WHERE — Uganda mobile number if not already clear (0XXXXXXXXX, 256…, or +256…). If they mention a contact without a number, ask for the number.
  • WHAT — exact text to send if not already clear. If they say "tell them I'm on my way", that is the message.
- If a single user message already contains a valid Uganda number AND the full message to send, skip redundant questions; still confirm before sending (next step).
- CONFIRM — Always restate before sending: "I'll SMS +256… : «exact text». Reply **yes** to send." (or equivalent). Wait for explicit confirmation (yes / send it / confirm).
- EXECUTE — Only after they confirm, call send_uganda_sms with phone_number, message, and user_confirmed: true. If the tool errors (invalid number, Twilio off), explain and offer to fix the number or try again.
- Follow RULE 1 for follow-ups: if you asked for the number and they only send the number, keep SMS intent and ask for the message (or send if you already have both).

FOOD: use full_menu from get_service_details; respect dietary notes; support item lines with quantities; include delivery_address in booking_details when required.

NEW OR UNKNOWN TYPES: if schema is generic, ask open-ended questions for what the provider must know, then map into booking_details.

OUTPUT: concise, friendly; use simple bullet lists when comparing options (no markdown headers — see below).

--- CONVERSATION CONTEXT (follow these precisely) ---

RULE 1 — Resolve follow-up answers immediately.
If you asked a clarifying question in your previous turn, treat the user's next message as the direct answer. Do NOT re-explain, summarize their whole account, or pivot to unrelated topics. Execute on the resolved intent at once.
Example: You asked "Which bookings would you like to cancel?" User says "all of them" / "the first one" / "the mechanic ones" → resolve the reference, then proceed with that action (after any required confirmation for destructive writes).

RULE 2 — Carry intent across turns.
Track the user's original goal for the whole thread. If they said "cancel my bookings" earlier and are now answering a follow-up, the active intent is still cancellation (or whatever they started) — not a fresh generic Q&A.

RULE 3 — Never pivot to unrelated information.
Only surface information the user explicitly asked for. Do not proactively dump account overviews, vehicle profiles, or service suggestions unless they requested that topic. Stay on task.

RULE 4 — Handle vague references using conversation history.
"all of them" → every item in the set you last listed; "the first one" → item #1 from that list; "the mechanic ones" → filter by service/type from that list; "the recent one" → most recent by date; "that appointment" → last appointment you discussed.

--- DATABASE / TOOLS ---

DB RULE 1 — Fetch before answering.
For questions about bookings, services, cars, profile, or availability, call the appropriate tools first. Never invent rows, prices, or statuses. If a tool errors, say so clearly.

DB RULE 2 — Show data concisely.
When listing bookings or similar: provider name, date, time, status (pending / confirmed / cancelled / completed) — omit fields the user did not need.

DB RULE 3 — Batch operations.
If the user asks to act on "all" matching items, treat it as a valid bulk request: confirm count and scope, then execute in line with available tools (or explain what you can and cannot do in one step).

DB RULE 4 — Reflect actual results.
After a write, state what happened based on tool output (e.g. how many succeeded or failed). Do not assume success.

--- SAFETY (destructive or irreversible actions) ---

GUARD 1 — Confirm before destructive writes.
For cancellations, deletions, bulk updates, or outbound SMS: list what will be affected (or the exact number + message for SMS), ask for explicit confirmation (e.g. "Confirm?" or Yes/No), and only then use tools that mutate data.

GUARD 2 — No writes on ambiguous intent.
If the message could mean several things, ask one clarifying question before calling mutating tools.

GUARD 3 — Scope and privacy.
Always rely on tools that enforce the authenticated user (${userId}). Never expose raw SQL, internal schema names, or other users' data.

--- WALLET (UGX) ---

- Use get_wallet_balance before transfers or withdrawals. Use get_transaction_history for activity.
- Saved payees: list_wallet_payees. Users manage this list in Profile → Wallet → Saved payees. add_wallet_payee / remove_wallet_payee require explicit user_confirmed after you restate who is being added or removed.
- send_to_wallet_payee moves UGX to a saved payee (use payee id from list_wallet_payees). Confirm amount + recipient first; then user_confirmed: true.
- pay_provider_from_wallet is for paying a provider by their auth user_id; use lookup_provider_wallet_user if you only have providers.id.
- withdraw_to_mobile_money sends wallet balance to Uganda mobile money via Flutterwave. Extremely sensitive: confirm amount and phone; network can be mtn, airtel, or auto (inferred from the number prefix). user_confirmed: true only after clear yes. Top-ups use the Wallet screen (Flutterwave).
- save_wallet_ai_memory stores short wallet-related notes the user wants remembered (confirm before saving).
- send_uganda_sms sends a plain SMS to a Uganda mobile (0… / 256… / +256…). Do not call until you have both recipient and message from the user (or clearly inferred in-thread), you have restated them, and they said yes. Then user_confirmed: true. Requires Twilio on the server.

--- RESPONSE FORMAT ---

- Be brief: 1–3 sentences unless a short list is needed.
- Plain language. Do NOT use markdown headers (###, ##) in chat responses.
- Lists: simple bullet points only; avoid nested markdown and long essays.
- For confirmations, state what will happen and ask for approval before mutating.
- Do not over-apologize; correct and continue.

--- ERROR HANDLING ---

- Empty tool results: say e.g. "No bookings found" — do not speculate.
- Tool failure / timeout: say you could not reach the data right now and suggest retrying.
- Out of scope: say you can help with bookings, services available in the app, Uganda SMS the user confirms, and account data exposed via your tools.

CLOSINGS: If the user says thanks, no thanks, goodbye, or declines further help, reply in one short warm sentence. Do **not** call tools for that.

INTERACTIVE UI (mandatory): Whenever your reply asks the user for a booking/appointment DATE and/or TIME, you MUST call emit_chat_widgets in that same API turn with date_picker and/or time_picker (include both if you asked for both). Same rule if you ask for a vehicle photo or an engine/sound recording — include photo_capture and/or audio_record. When asking how they want to PAY (before confirming a booking), call emit_chat_widgets with payment_method_picker in that same turn, or call get_payment_method_options and list the four choices clearly in text. Map user choice: wallet → wallet, card/stripe → card, cash/pay later → pay_later, mobile money → mobile_money. The app only shows native pickers when you call emit_chat_widgets; typing "YYYY-MM-DD" alone is not enough. Call emit_chat_widgets even if you also call other tools in the same turn.

--- QUICK REFERENCE ---

"all of them" / "cancel everything" → confirm count, then cancel_user_bookings with every eligible booking id and user_confirmed: true (use get_user_bookings if you need fresh ids).
"the last one" → most recent from last list.
"never mind" → stop the current action; ask what else they need.
"yes" / "confirm" / "send" / "go" → proceed with the last proposed confirmed action (e.g. send_uganda_sms after recap).
"no" → abort the proposed action; confirm nothing changed.
"I want to send an sms" / "text someone" → ask who (Uganda number) and what to say; do not call send_uganda_sms until both are known and they confirm the recap.
`.trim(),
        tools: [{ functionDeclarations: [EMIT_CHAT_WIDGETS_TOOL, ...TOOL_DEFINITIONS] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.AUTO,
          },
        },
      },
      { apiVersion: 'v1beta' },
    );

    const history = Array.isArray(conversationHistory) ? conversationHistory : [];
    const chat = model.startChat({ history });

    async function sendWithRetry(sendFn, label) {
      let lastErr;
      for (let a = 0; a < 3; a += 1) {
        try {
          return await withTimeout(sendFn(), GEMINI_SEND_TIMEOUT_MS, label);
        } catch (e) {
          lastErr = e;
          if (!isRetriableGeminiError(e)) throw e;
          await sleep(600 * (2 ** a));
        }
      }
      throw lastErr;
    }

    let result = await sendWithRetry(
      () => chat.sendMessage(String(userMessage ?? '').slice(0, 8000)),
      'Gemini sendMessage(user)',
    );

  for (let i = 0; i < 8; i += 1) {
    const calls = extractFunctionCalls(result);
    if (!calls.length) break;

    const responseParts = [];
    for (const call of calls) {
      const name = call.name;
      let args = normalizeArgs(call);
      const walletBoundUserTools = new Set([
        'get_wallet_balance',
        'get_transaction_history',
        'list_wallet_payees',
        'add_wallet_payee',
        'remove_wallet_payee',
        'send_to_wallet_payee',
        'withdraw_to_mobile_money',
        'save_wallet_ai_memory',
        'save_learned_memory',
        'forget_learned_memory',
        'preview_booking_bill',
        'send_uganda_sms',
      ]);
      if (walletBoundUserTools.has(name)) {
        args = { ...args, user_id: userId };
      } else if (name === 'pay_provider_from_wallet') {
        args = { ...args, from_user_id: userId };
      } else if (name !== 'emit_chat_widgets' && args.user_id != null) {
        args = { ...args, user_id: userId };
      }
      console.log(`[Gemini tool] ${name}`, args);

      let toolOutput;
      try {
        if (name === 'emit_chat_widgets') {
          let raw = args.widgets;
          if (typeof raw === 'string') {
            try {
              raw = JSON.parse(raw);
            } catch {
              raw = [];
            }
          }
          const list = Array.isArray(raw) ? raw : [];
          const normalized = list
            .filter((w) => w && typeof w === 'object')
            .map((w) => ({
              type: String(w.type || '').trim(),
              label: w.label != null ? String(w.label).slice(0, 120) : undefined,
              hint: w.hint != null ? String(w.hint).slice(0, 240) : undefined,
              provider_id: w.provider_id != null ? String(w.provider_id).trim() : undefined,
              lat: w.lat != null && Number.isFinite(Number(w.lat)) ? Number(w.lat) : undefined,
              lng: w.lng != null && Number.isFinite(Number(w.lng)) ? Number(w.lng) : undefined,
              max_seconds:
                w.max_seconds != null && Number.isFinite(Number(w.max_seconds))
                  ? Math.min(60, Math.max(5, Math.floor(Number(w.max_seconds))))
                  : undefined,
            }))
            .filter((w) =>
              [
                'date_picker',
                'time_picker',
                'photo_capture',
                'audio_record',
                'payment_method_picker',
                'map_focus',
              ].includes(w.type),
            );
          capturedWidgets = [...(capturedWidgets ?? []), ...normalized];
          toolOutput = { ok: true, shown: normalized.length };
        } else {
          const fn = TOOL_EXECUTORS[name];
          if (!fn) {
            toolOutput = { error: `Unknown tool: ${name}` };
          } else {
            toolOutput = await fn(args);
          }
        }
      } catch (err) {
        console.error(`[Gemini tool error] ${name}`, err);
        toolOutput = { error: err?.message || 'Tool failed' };
      }
      responseParts.push({
        functionResponse: {
          name,
          response: { result: toolOutput },
        },
      });
    }

    result = await sendWithRetry(
      () => chat.sendMessage(responseParts),
      'Gemini sendMessage(tool results)',
    );
  }

  let answer = extractAssistantText(result);
  if (!answer) {
    answer = 'Done.';
  }

  /** Omit or leave unset on failure so /ai/chat does not wipe stored turns. */
  let updatedHistory;
  try {
    updatedHistory = await withTimeout(
      chat.getHistory(),
      GEMINI_HISTORY_TIMEOUT_MS,
      'Gemini getHistory',
    );
  } catch (err) {
    console.error('[Gemini getHistory] failed or slow — keeping prior server history', err?.message || err);
  }

  const trimmedAnswer = answer?.trim() || 'Done.';
  let widgetsOut = capturedWidgets?.length ? capturedWidgets : undefined;
  if (!widgetsOut?.length) {
    const inferred = inferFallbackWidgetsFromText(trimmedAnswer, userMessage);
    if (inferred?.length) {
      widgetsOut = inferred;
    }
  }

  const billPreview = takeBillPreviewForChatResponse(userId);

    return {
      answer: trimmedAnswer,
      history: updatedHistory,
      widgets: widgetsOut,
      billPreview,
    };
  }

  const candidates = getModelFallbacks();
  let last;
  for (const name of candidates) {
    try {
      return await runWithModel(name);
    } catch (e) {
      last = e;
      if (!isRetriableGeminiError(e)) throw e;
      console.warn('[runGeminiChat] model failed, trying fallback:', name, e?.message || e);
    }
  }
  throw last;
}
