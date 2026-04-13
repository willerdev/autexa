import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import Stripe from 'stripe';
import { createServiceClient } from './lib/supabase.js';
import * as flutterwaveLib from './lib/flutterwave.js';
import { aiRouter } from './routes/ai.js';
import { adminRouter, getPublicCategoriesHandler } from './routes/admin.js';
import { publicProviderDetailHandler, publicProvidersHandler, publicServicesHandler } from './routes/publicApi.js';
import { bookingsRouter } from './routes/bookings.js';
import { completeBookingPaymentFromTxRef, paymentsRouter } from './routes/payments.js';
import { pitstopRouter } from './routes/pitstop.js';
import { pushRouter } from './routes/push.js';
import { serviceCatalogRouter } from './routes/serviceCatalog.js';
import { paymentLinksPublicRouter } from './routes/paymentLinksPublic.js';
import { savingsChallengesRouter } from './routes/savingsChallenges.js';
import { walletRouter } from './routes/wallet.js';
import { completePendingTopupByTxRef, creditWallet } from './services/walletService.js';

// Load server/.env from this package root (not process.cwd()) so FLUTTERWAVE_* etc. load
// when the API is started from the monorepo root or any other working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

/**
 * Flutterwave webhooks — verify `verif-hash` against FLUTTERWAVE_SECRET_HASH (dashboard).
 */
app.post('/api/webhooks/flutterwave', express.json({ limit: '2mb' }), async (req, res) => {
  const verif = req.headers['verif-hash'];
  if (!flutterwaveLib.verifyWebhookVerifHash(verif)) {
    console.warn('[flutterwave webhook] invalid or missing verif-hash');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body;
    const eventType = String(payload?.event || payload?.type || '');
    const data = payload?.data;
    const txRef = String(data?.tx_ref || data?.reference || '').trim();
    const st = String(data?.status || '').toLowerCase();

    if (
      txRef &&
      eventType === 'charge.completed' &&
      (st === 'successful' || st === 'success' || st === 'succeeded')
    ) {
      await completeBookingPaymentFromTxRef(txRef, payload);
      await completePendingTopupByTxRef(txRef);
    }
  } catch (e) {
    console.error('[flutterwave webhook] handler', e);
    return res.status(500).json({ received: false });
  }
  res.json({ received: true });
});

/** Stripe webhook — disabled unless STRIPE_WEBHOOK_ENABLED=1 (bookings use Flutterwave). */
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (process.env.STRIPE_WEBHOOK_ENABLED !== '1') {
      return res.status(410).send('Stripe webhook disabled — use Flutterwave for checkout.');
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) {
      return res.status(500).send('Stripe webhook not configured');
    }
    const stripe = new Stripe(key);
    let event;
    try {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('[stripe webhook] signature', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const bookingId = session.metadata?.booking_id;
        const userId = session.metadata?.user_id;
        const kind = session.metadata?.kind;
        const amount = session.amount_total;
        if (kind === 'wallet_topup' && userId) {
          const ugx = Number(session.metadata?.amount_ugx || 0);
          if (Number.isFinite(ugx) && ugx > 0) {
            await creditWallet({
              userId,
              amount: ugx,
              description: 'Card top-up (Stripe)',
              paymentMethod: 'stripe',
              momoPhone: null,
              momoProvider: null,
              momoReference: session.id,
            });
          }
        } else if (bookingId && userId) {
          const sb = createServiceClient();
          await sb
            .from('bookings')
            .update({
              payment_status: 'paid',
              status: 'confirmed',
            })
            .eq('id', bookingId)
            .eq('user_id', userId);

          await sb.from('payment_transactions').insert({
            user_id: userId,
            booking_id: bookingId,
            provider: 'stripe',
            provider_ref: session.id,
            amount_cents: amount ?? 0,
            currency: session.currency || 'usd',
            status: 'completed',
            raw: session,
          });
        }
      }
    } catch (e) {
      console.error('[stripe webhook] handler', e);
      return res.status(500).json({ received: false });
    }
    res.json({ received: true });
  },
);

app.use(express.json({ limit: '25mb' }));

app.get('/api/public/categories', getPublicCategoriesHandler);
app.get('/api/public/providers', publicProvidersHandler);
app.get('/api/public/providers/:id', publicProviderDetailHandler);
app.get('/api/public/services', publicServicesHandler);
app.use('/api/public/payment-link', paymentLinksPublicRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'autexa-api' });
});

app.get('/checkout/return', (req, res) => {
  const sessionId = req.query.session_id ? String(req.query.session_id) : '';
  const txRef = req.query.tx_ref ? String(req.query.tx_ref) : '';
  res.set('Content-Type', 'text/html; charset=utf-8');
  const deepLink = txRef
    ? `autexa://checkout-complete?tx_ref=${encodeURIComponent(txRef)}`
    : `autexa://checkout-complete?session_id=${encodeURIComponent(sessionId)}`;
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head><body>
<p>Payment complete. Opening Autexa…</p>
<script>
  (function(){
    window.location.href = ${JSON.stringify(deepLink)};
    setTimeout(function(){ document.body.innerHTML += '<p>If the app did not open, return to Autexa manually.</p>'; }, 4000);
  })();
</script></body></html>`);
});

app.get('/checkout/cancel', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><body><p>Checkout canceled.</p>
<script>window.location.href='autexa://checkout-canceled';</script></body></html>`);
});

app.use('/api/ai', aiRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/pitstop', pitstopRouter);
app.use('/api/services', serviceCatalogRouter);
app.use('/api/push', pushRouter);
app.use('/api/admin', adminRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/savings-challenges', savingsChallengesRouter);

app.post('/api/payments/mobile-money-placeholder', (_req, res) => {
  res.status(501).json({
    error: 'Use Flutterwave wallet top-up or standard checkout',
    hint: 'POST /api/wallet/topup or /api/payments/create-checkout-session',
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Autexa API listening on http://${host}:${port}`);
});
