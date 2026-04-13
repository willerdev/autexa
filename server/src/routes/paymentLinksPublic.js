import { Router } from 'express';
import * as walletService from '../services/walletService.js';

/** Simple fixed-window rate limit per IP+slug for guest top-ups. */
const guestTopupBuckets = new Map();

function allowGuestTopup(bucketKey) {
  const windowMs = 60 * 60 * 1000;
  const max = 24;
  const now = Date.now();
  let b = guestTopupBuckets.get(bucketKey);
  if (!b || now - b.t > windowMs) {
    b = { c: 0, t: now };
  }
  b.c += 1;
  guestTopupBuckets.set(bucketKey, b);
  return b.c <= max;
}

export const paymentLinksPublicRouter = Router();

paymentLinksPublicRouter.get('/topup/:id/status', async (req, res) => {
  try {
    const result = await walletService.checkGuestTopupStatus(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Status check failed' });
  }
});

paymentLinksPublicRouter.get('/:slug', async (req, res) => {
  try {
    const meta = await walletService.getPublicPaymentLinkBySlug(req.params.slug);
    if (!meta) return res.status(404).json({ error: 'Link not found or inactive' });
    res.json(meta);
  } catch (e) {
    console.error('[GET /public/payment-link/:slug]', e);
    res.status(500).json({ error: e?.message || 'Failed to load link' });
  }
});

paymentLinksPublicRouter.post('/:slug/topup', async (req, res) => {
  try {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const key = `${ip}:${req.params.slug}`;
    if (!allowGuestTopup(key)) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    const { amount, phone, provider } = req.body ?? {};
    if (amount == null || !phone) {
      return res.status(400).json({ error: 'amount and phone are required' });
    }
    const result = await walletService.initiateGuestTopupForLink({
      slug: req.params.slug,
      amount: Number(amount),
      phone: String(phone),
      provider: provider != null ? String(provider) : 'auto',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Top-up failed' });
  }
});
