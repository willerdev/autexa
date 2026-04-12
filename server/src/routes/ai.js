import { Router } from 'express';
import multer from 'multer';
import { requireUser } from '../lib/auth.js';
import { chatMessages, generateMediaInsight, generateVisionJson } from '../lib/gemini.js';
import { aiRankProviders, listProvidersAvailable } from '../lib/providers.js';
import { buildUserContext } from '../../utils/buildUserContext.js';
import { rateLimitHit } from '../../utils/aiChatRateLimit.js';
import { clearBookingBillPreviewState } from '../lib/bookingBillPreview.js';
import { runGeminiChat } from '../../utils/geminiChat.js';
import { PROMPTS, systemWithUserContext } from '../../utils/prompts.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

const uploadChatMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

export const aiRouter = Router();
aiRouter.use(requireUser);

/** Tool-calling chat turns (Gemini history format); keyed by Supabase user id */
const toolChatHistoryByUser = new Map();

aiRouter.get('/context', async (req, res) => {
  try {
    const ctx = await buildUserContext(req.user.id);
    res.json({ context: ctx });
  } catch (e) {
    console.error('[GET /ai/context]', e);
    res.status(500).json({ error: 'Could not load user context' });
  }
});

aiRouter.post('/recommend', async (req, res) => {
  try {
    const { query: userQuery, serviceName } = req.body ?? {};
    const providers = await listProvidersAvailable();
    const ctx = await buildUserContext(req.user.id);
    const system = systemWithUserContext({
      userContextJson: JSON.stringify(ctx),
    });
    const result = await aiRankProviders(providers, userQuery, serviceName, system);
    res.json({
      ...result,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        service_type: p.service_type,
        rating: Number(p.rating),
        location: p.location,
        base_price_cents: p.base_price_cents,
        is_available: p.is_available,
      })),
    });
  } catch (e) {
    console.error('[POST /ai/recommend]', e);
    res.status(500).json({ error: e?.message || 'Recommendation failed' });
  }
});

aiRouter.delete('/chat/history', (req, res) => {
  toolChatHistoryByUser.delete(req.user.id);
  clearBookingBillPreviewState(req.user.id);
  res.json({ success: true });
});

/** Image or short audio from assistant chat widgets — returns plain-language insight for the thread */
aiRouter.post('/chat/attachment', uploadChatMedia.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'file required (multipart field: file)' });
    }
    const kind = String(req.body?.kind ?? 'image').toLowerCase();
    const mime = req.file.mimetype || (kind === 'audio' ? 'audio/m4a' : 'image/jpeg');

    let prompt;
    if (kind === 'audio') {
      prompt = `You are an automotive assistant. The user recorded this short audio (often an engine running, exhaust, or cabin noise).
Listen carefully. Reply in plain language (no JSON, no markdown headers):
• What you hear (idle, revving, knocking, popping/misfire-like sounds, squeal, exhaust note, etc.)
• Whether a misfire or serious engine issue is plausible and confidence (low/medium/high)
• Practical next steps (e.g. check engine light, scan codes, mechanic) — stay concise (under 12 sentences).`;
    } else {
      prompt = `You are an automotive assistant. The user shared a photo from their vehicle (engine bay, damage, dash warning, etc.).
Describe what you see, any obvious concerns, and brief next steps. Plain language only — no JSON, no markdown headers. Under 12 sentences.`;
    }

    const text = await generateMediaInsight(prompt, req.file.buffer, mime);
    return res.json({ summary: text?.trim() || 'No analysis returned.' });
  } catch (e) {
    console.error('[POST /ai/chat/attachment]', e);
    return res.status(500).json({ error: e?.message || 'Attachment analysis failed' });
  }
});

aiRouter.post('/chat', async (req, res) => {
  try {
    const { message, messages } = req.body ?? {};
    if (typeof message === 'string' && message.trim()) {
      if (rateLimitHit(`ai-chat:${req.user.id}`, { limit: 30, windowMs: 60_000 })) {
        return res.status(429).json({
          error: 'Too many requests. Please wait a minute and try again.',
        });
      }
      try {
        const prev = toolChatHistoryByUser.get(req.user.id) ?? [];
        const { answer, history, widgets, billPreview } = await runGeminiChat({
          userMessage: message.trim(),
          userId: req.user.id,
          conversationHistory: prev,
        });
        if (Array.isArray(history) && history.length > 0) {
          toolChatHistoryByUser.set(req.user.id, history.slice(-40));
        } else if (history == null) {
          toolChatHistoryByUser.delete(req.user.id);
        }
        const payload = { answer };
        if (Array.isArray(widgets) && widgets.length) {
          payload.widgets = widgets;
        }
        if (billPreview && (billPreview.image || billPreview.textReceipt)) {
          payload.billPreview = billPreview;
        }
        return res.json(payload);
      } catch (e) {
        console.error('[POST /ai/chat] tool-calling', e);
        toolChatHistoryByUser.delete(req.user.id);
        return res.status(500).json({
          error: "I'm having trouble right now. Please try again in a moment.",
        });
      }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Send { message } or non-empty messages[]' });
    }
    const ctx = await buildUserContext(req.user.id);
    const normalized = messages
      .filter((m) => m && typeof m.content === 'string')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.slice(0, 4000),
      }));
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No valid messages' });
    }
    const system = systemWithUserContext({
      userContextJson: JSON.stringify(ctx),
    });
    const messagesForModel = [
      { role: 'user', content: `${system}\n\nFollow the user conversation below.` },
      ...normalized,
    ];
    const reply = await chatMessages(messagesForModel);
    res.json({ reply: reply?.slice(0, 8000) ?? '' });
  } catch (e) {
    console.error('[POST /ai/chat]', e);
    res.status(500).json({ error: 'Chat failed. Please try again in a moment.' });
  }
});

aiRouter.post('/analyze-damage', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'image file required (field name: image)' });
    }
    const mime = req.file.mimetype || 'image/jpeg';
    const ctx = await buildUserContext(req.user.id);
    const system = systemWithUserContext({ userContextJson: JSON.stringify(ctx) });
    const text = await generateVisionJson(`${system}\n\n${PROMPTS.damageAnalysis}`, req.file.buffer, mime);
    const fence = text.match(/\{[\s\S]*\}/);
    let json = null;
    try {
      json = fence ? JSON.parse(fence[0]) : JSON.parse(text);
    } catch {
      json = {
        issue: 'Unable to parse model output',
        severity: 'low',
        estimatedRepairUsdMin: 0,
        estimatedRepairUsdMax: 0,
        notes: text?.slice(0, 500) || 'No details',
      };
    }
    res.json({ analysis: json });
  } catch (e) {
    console.error('[POST /ai/analyze-damage]', e);
    res.status(500).json({ error: e?.message || 'Image analysis failed' });
  }
});

aiRouter.post('/recognize-car', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'image file required (field name: image)' });
    }
    const mime = req.file.mimetype || 'image/jpeg';
    const ctx = await buildUserContext(req.user.id);
    const system = systemWithUserContext({ userContextJson: JSON.stringify(ctx) });
    const text = await generateVisionJson(`${system}\n\n${PROMPTS.recognizeCar}`, req.file.buffer, mime);
    const fence = text.match(/\{[\s\S]*\}/);
    let json = null;
    try {
      json = fence ? JSON.parse(fence[0]) : JSON.parse(text);
    } catch {
      json = { make: '', model: '', year: '', plate: '', confidence: 0.2, notes: text?.slice(0, 500) || 'No details' };
    }
    res.json({ car: json });
  } catch (e) {
    console.error('[POST /ai/recognize-car]', e);
    res.status(500).json({ error: e?.message || 'recognize-car failed' });
  }
});

aiRouter.post('/analyze-car-scan', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'image file required (field name: image)' });
    }
    const mime = req.file.mimetype || 'image/jpeg';
    const mode = String(req.body?.mode ?? 'cluster');
    const car = {
      make: String(req.body?.make ?? ''),
      model: String(req.body?.model ?? ''),
      year: String(req.body?.year ?? ''),
      plate: String(req.body?.plate ?? ''),
    };
    const ctx = await buildUserContext(req.user.id);
    const system = systemWithUserContext({ userContextJson: JSON.stringify(ctx) });
    const prompt = PROMPTS.analyzeCarScan({ mode, carJson: JSON.stringify(car) });
    const text = await generateVisionJson(`${system}\n\n${prompt}`, req.file.buffer, mime);
    const fence = text.match(/\{[\s\S]*\}/);
    let json = null;
    try {
      json = fence ? JSON.parse(fence[0]) : JSON.parse(text);
    } catch {
      json = {
        summary: 'Unable to parse model output',
        issues: [],
        suggestions: [{ serviceKeyword: 'car wash', reason: 'General upkeep', urgency: 'normal' }],
      };
    }
    res.json({ result: json });
  } catch (e) {
    console.error('[POST /ai/analyze-car-scan]', e);
    res.status(500).json({ error: e?.message || 'analyze-car-scan failed' });
  }
});

aiRouter.post('/describe-service-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'image file required (field name: image)' });
    }
    const mime = req.file.mimetype || 'image/jpeg';
    const ctx = await buildUserContext(req.user.id);
    const system = systemWithUserContext({ userContextJson: JSON.stringify(ctx) });
    const text = await generateVisionJson(`${system}\n\n${PROMPTS.describeServiceImage}`, req.file.buffer, mime);
    const fence = text.match(/\{[\s\S]*\}/);
    let json = null;
    try {
      json = fence ? JSON.parse(fence[0]) : JSON.parse(text);
    } catch {
      json = { title: 'Service', description: text?.slice(0, 300) || '' };
    }
    res.json({ suggestion: json });
  } catch (e) {
    console.error('[POST /ai/describe-service-image]', e);
    res.status(500).json({ error: e?.message || 'describe-service-image failed' });
  }
});

/** Optional: structured service intent extraction */
aiRouter.post('/parse-intent', async (req, res) => {
  try {
    const { text } = req.body ?? {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const ctx = await buildUserContext(req.user.id);
    const prompt = `Extract intent from: "${text.slice(0, 2000)}"
Return ONLY JSON: {"serviceKeywords":[],"budgetHint":null|"low"|"medium"|"high","urgency":"normal"|"soon"|"urgent"}`;
    const system = `${systemWithUserContext({ userContextJson: JSON.stringify(ctx) })}

Output JSON only. Relate to car wash, mechanic, tow, detailing, tires, battery.`;
    const { generateJsonText } = await import('../lib/gemini.js');
    const out = await generateJsonText(prompt, system);
    const m = out.match(/\{[\s\S]*\}/);
    let json = {};
    try {
      json = m ? JSON.parse(m[0]) : {};
    } catch {
      json = {};
    }
    res.json({ intent: json });
  } catch (e) {
    console.error('[POST /ai/parse-intent]', e);
    res.status(500).json({ error: 'Could not parse intent. Please try again.' });
  }
});
