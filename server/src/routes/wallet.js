import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import * as walletService from '../services/walletService.js';
import Stripe from 'stripe';

export const walletRouter = Router();
walletRouter.use(requireUser);

walletRouter.get('/', async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.user.id);
    res.json(wallet);
  } catch (e) {
    console.error('[GET /wallet]', e);
    res.status(500).json({ error: e?.message || 'Wallet error' });
  }
});

walletRouter.post('/topup', async (req, res) => {
  try {
    const { amount, phone, provider } = req.body ?? {};
    if (amount == null || !phone) {
      return res.status(400).json({ error: 'amount and phone are required' });
    }
    const result = await walletService.initiateTopup({
      userId: req.user.id,
      amount: Number(amount),
      phone: String(phone),
      provider: provider != null ? String(provider) : 'auto',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Top-up failed' });
  }
});

walletRouter.get('/topup/:id/status', async (req, res) => {
  try {
    const result = await walletService.checkTopupStatus({
      topupRequestId: req.params.id,
      userId: req.user.id,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Status check failed' });
  }
});

walletRouter.post('/withdraw', async (req, res) => {
  try {
    const { amount, phone, provider } = req.body ?? {};
    if (amount == null || !phone) {
      return res.status(400).json({ error: 'amount and phone are required' });
    }
    const result = await walletService.initiateWithdrawal({
      userId: req.user.id,
      amount: Number(amount),
      phone: String(phone),
      provider: provider != null ? String(provider) : 'auto',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Withdrawal failed' });
  }
});

walletRouter.post('/topup/card', async (req, res) => {
  try {
    const { amount } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1000) return res.status(400).json({ error: 'Minimum top-up is 1,000 UGX' });
    if (amt > 5_000_000) return res.status(400).json({ error: 'Maximum top-up is 5,000,000 UGX' });

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(501).json({ error: 'Card top-up not configured (missing STRIPE_SECRET_KEY)' });

    const stripe = new Stripe(key);
    const serverBase = process.env.PUBLIC_SERVER_URL || process.env.SERVER_PUBLIC_URL || '';
    if (!serverBase) {
      return res.status(500).json({ error: 'Missing PUBLIC_SERVER_URL (needed for Stripe return URLs)' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'ugx',
            unit_amount: Math.round(amt),
            product_data: { name: 'Autexa wallet top-up' },
          },
        },
      ],
      metadata: {
        kind: 'wallet_topup',
        user_id: req.user.id,
        amount_ugx: String(Math.round(amt)),
      },
      success_url: `${serverBase.replace(/\/$/, '')}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${serverBase.replace(/\/$/, '')}/checkout/cancel`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[POST /wallet/topup/card]', e);
    res.status(500).json({ error: e?.message || 'Could not start card payment' });
  }
});

walletRouter.post('/savings/deposit', async (req, res) => {
  try {
    const { amount, description } = req.body ?? {};
    if (amount == null) return res.status(400).json({ error: 'amount is required' });
    const result = await walletService.depositToSavings({
      userId: req.user.id,
      amount: Number(amount),
      description: description != null ? String(description) : undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Savings deposit failed' });
  }
});

walletRouter.post('/savings/withdraw', async (req, res) => {
  try {
    const { amount, description } = req.body ?? {};
    if (amount == null) return res.status(400).json({ error: 'amount is required' });
    const result = await walletService.withdrawFromSavings({
      userId: req.user.id,
      amount: Number(amount),
      description: description != null ? String(description) : undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Savings withdraw failed' });
  }
});

walletRouter.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const from = (page - 1) * limit;
    const type = req.query.type ? String(req.query.type) : null;
    const uid = req.user.id;

    const sb = createServiceClient();
    let q = sb
      .from('transactions')
      .select('*', { count: 'exact' })
      .or(`user_id.eq.${uid},counterparty_user_id.eq.${uid}`)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (type) q = q.eq('type', type);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ data: data ?? [], total: count ?? 0, page });
  } catch (e) {
    console.error('[GET /wallet/transactions]', e);
    res.status(500).json({ error: e?.message || 'Failed to load transactions' });
  }
});

walletRouter.post('/pay-provider', async (req, res) => {
  try {
    const { providerUserId, amount, bookingId, description } = req.body ?? {};
    if (!providerUserId || amount == null) {
      return res.status(400).json({ error: 'providerUserId and amount are required' });
    }
    const result = await walletService.transferToProvider({
      fromUserId: req.user.id,
      toUserId: String(providerUserId),
      amount: Number(amount),
      description: description || 'Service payment',
      bookingId: bookingId || null,
      initiatedBy: 'user',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Payment failed' });
  }
});

walletRouter.get('/payees', async (req, res) => {
  try {
    const rows = await walletService.listPayees(req.user.id);
    res.json({ data: rows });
  } catch (e) {
    console.error('[GET /wallet/payees]', e);
    res.status(500).json({ error: e?.message || 'Failed to load payees' });
  }
});

walletRouter.post('/payees', async (req, res) => {
  try {
    const { label, providerId, payeeUserId } = req.body ?? {};
    const row = await walletService.addPayee({
      ownerUserId: req.user.id,
      label: String(label ?? ''),
      providerId: providerId ?? null,
      payeeUserId: payeeUserId ?? null,
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not add payee' });
  }
});

walletRouter.delete('/payees/:id', async (req, res) => {
  try {
    const result = await walletService.removePayee(req.user.id, req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not remove payee' });
  }
});

walletRouter.post('/transfer-payee', async (req, res) => {
  try {
    const { payeeId, amount, description } = req.body ?? {};
    if (!payeeId || amount == null) {
      return res.status(400).json({ error: 'payeeId and amount are required' });
    }
    const result = await walletService.transferToSavedPayee({
      ownerUserId: req.user.id,
      payeeRowId: String(payeeId),
      amount: Number(amount),
      description: description ? String(description) : undefined,
      initiatedBy: 'user',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Transfer failed' });
  }
});

walletRouter.get('/payment-links', async (req, res) => {
  try {
    const rows = await walletService.listPaymentLinks(req.user.id);
    res.json({ data: rows });
  } catch (e) {
    console.error('[GET /wallet/payment-links]', e);
    res.status(500).json({ error: e?.message || 'Failed to load payment links' });
  }
});

walletRouter.post('/payment-links', async (req, res) => {
  try {
    const { title, suggestedAmountUgx, expiresAt } = req.body ?? {};
    const row = await walletService.createPaymentLink({
      ownerUserId: req.user.id,
      title: title != null ? String(title) : undefined,
      suggestedAmountUgx,
      expiresAt: expiresAt != null ? String(expiresAt) : null,
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not create link' });
  }
});

walletRouter.patch('/payment-links/:id', async (req, res) => {
  try {
    const { active } = req.body ?? {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }
    const row = await walletService.setPaymentLinkActive(req.user.id, req.params.id, active);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not update link' });
  }
});
