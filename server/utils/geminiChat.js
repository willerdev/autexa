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

  const modelName = process.env.GEMINI_TOOLS_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const genAI = new GoogleGenerativeAI(getKey());
  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      systemInstruction: `
You are Autexa's AI assistant — an intelligent service booking helper for many verticals (automotive, food, cleaning, and anything providers list).
The authenticated user's ID is: ${userId}
Today's date is: ${new Date().toDateString()} (${new Date().toISOString().slice(0, 10)})
${userMemorySnippet}

CORE BEHAVIOUR:
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
For cancellations, deletions, or bulk updates: list what will be affected (with count), ask for explicit confirmation (e.g. "Confirm?" or Yes/No), and only then use tools that mutate data.

GUARD 2 — No writes on ambiguous intent.
If the message could mean several things, ask one clarifying question before calling mutating tools.

GUARD 3 — Scope and privacy.
Always rely on tools that enforce the authenticated user (${userId}). Never expose raw SQL, internal schema names, or other users' data.

--- WALLET (UGX) ---

- Use get_wallet_balance before transfers or withdrawals. Use get_transaction_history for activity.
- Saved payees: list_wallet_payees. Users manage this list in Profile → Wallet → Saved payees. add_wallet_payee / remove_wallet_payee require explicit user_confirmed after you restate who is being added or removed.
- send_to_wallet_payee moves UGX to a saved payee (use payee id from list_wallet_payees). Confirm amount + recipient first; then user_confirmed: true.
- pay_provider_from_wallet is for paying a provider by their auth user_id; use lookup_provider_wallet_user if you only have providers.id.
- withdraw_to_mobile_money sends wallet balance to Uganda mobile money via Flutterwave. Extremely sensitive: confirm amount, phone, and network (mtn/airtel); user_confirmed: true only after clear yes. Top-ups use the Wallet screen (Flutterwave).
- save_wallet_ai_memory stores short wallet-related notes the user wants remembered (confirm before saving).

--- RESPONSE FORMAT ---

- Be brief: 1–3 sentences unless a short list is needed.
- Plain language. Do NOT use markdown headers (###, ##) in chat responses.
- Lists: simple bullet points only; avoid nested markdown and long essays.
- For confirmations, state what will happen and ask for approval before mutating.
- Do not over-apologize; correct and continue.

--- ERROR HANDLING ---

- Empty tool results: say e.g. "No bookings found" — do not speculate.
- Tool failure / timeout: say you could not reach the data right now and suggest retrying.
- Out of scope: say you can help with bookings, services available in the app, and account data exposed via your tools.

CLOSINGS: If the user says thanks, no thanks, goodbye, or declines further help, reply in one short warm sentence. Do **not** call tools for that.

INTERACTIVE UI (mandatory): Whenever your reply asks the user for a booking/appointment DATE and/or TIME, you MUST call emit_chat_widgets in that same API turn with date_picker and/or time_picker (include both if you asked for both). Same rule if you ask for a vehicle photo or an engine/sound recording — include photo_capture and/or audio_record. When asking how they want to PAY (before confirming a booking), call emit_chat_widgets with payment_method_picker in that same turn, or call get_payment_method_options and list the four choices clearly in text. Map user choice: wallet → wallet, card/stripe → card, cash/pay later → pay_later, mobile money → mobile_money. The app only shows native pickers when you call emit_chat_widgets; typing "YYYY-MM-DD" alone is not enough. Call emit_chat_widgets even if you also call other tools in the same turn.

--- QUICK REFERENCE ---

"all of them" / "cancel everything" → confirm count, then cancel_user_bookings with every eligible booking id and user_confirmed: true (use get_user_bookings if you need fresh ids).
"the last one" → most recent from last list.
"never mind" → stop the current action; ask what else they need.
"yes" / "confirm" → proceed with the last proposed confirmed action.
"no" → abort the proposed action; confirm nothing changed.
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

  let result = await chat.sendMessage(String(userMessage ?? '').slice(0, 8000));

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
              max_seconds:
                w.max_seconds != null && Number.isFinite(Number(w.max_seconds))
                  ? Math.min(60, Math.max(5, Math.floor(Number(w.max_seconds))))
                  : undefined,
            }))
            .filter((w) =>
              ['date_picker', 'time_picker', 'photo_capture', 'audio_record', 'payment_method_picker'].includes(w.type),
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

    result = await chat.sendMessage(responseParts);
  }

  let answer = '';
  try {
    answer = result.response.text();
  } catch {
    answer = "I couldn't generate a text reply. If this keeps happening, try rephrasing your question.";
  }

  let updatedHistory = null;
  try {
    updatedHistory = await chat.getHistory();
  } catch (err) {
    console.error('[Gemini getHistory] failed — clearing stored chat for this user on next save', err);
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
