import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { getOrInitSubscription, getUsage, planLimits, startProfessionalSubscription } from '../services/subscriptionsService.js';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireUser);

subscriptionsRouter.get('/status', async (req, res) => {
  try {
    const sub = await getOrInitSubscription(req.user.id);
    const usage = await getUsage(req.user.id);
    const limits = planLimits(sub.plan);
    res.json({
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      aiUsed: usage.ai_requests_count || 0,
      aiLimit: limits.aiMonthly,
      smsAllowed: Boolean(limits.smsAllowed),
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Could not load subscription' });
  }
});

subscriptionsRouter.post('/upgrade/start', async (req, res) => {
  try {
    const { phone, provider } = req.body ?? {};
    const phoneStr = String(phone || '').trim();
    if (!phoneStr) return res.status(400).json({ error: 'phone is required' });
    const prov = provider != null ? String(provider).trim().toLowerCase() : null;
    const out = await startProfessionalSubscription({ userId: req.user.id, phone: phoneStr, provider: prov });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not start upgrade' });
  }
});

