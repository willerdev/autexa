import crypto from 'crypto';
import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import * as flutterwave from '../lib/flutterwave.js';

export const paymentsRouter = Router();
paymentsRouter.use(requireUser);

/**
 * Mark booking paid when Flutterwave confirms (webhook or client return flow).
 * Idempotent.
 */
export async function completeBookingPaymentFromTxRef(txRef, rawPayload = null) {
  const sb = createServiceClient();
  const ref = String(txRef ?? '').trim();
  if (!ref) return { ok: false, reason: 'missing tx_ref' };

  const { data: booking, error } = await sb
    .from('bookings')
    .select('id,user_id,payment_status,amount_cents,service_name')
    .eq('flutterwave_tx_ref', ref)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return { ok: false, reason: 'booking not found for tx_ref' };
  if (booking.payment_status === 'paid') return { ok: true, already_paid: true, booking_id: booking.id };

  const amountCents =
    booking.amount_cents && Number(booking.amount_cents) > 0 ? Number(booking.amount_cents) : 4500;

  const { error: upErr } = await sb
    .from('bookings')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
    })
    .eq('id', booking.id)
    .eq('user_id', booking.user_id);
  if (upErr) throw new Error(upErr.message);

  await sb.from('payment_transactions').insert({
    user_id: booking.user_id,
    booking_id: booking.id,
    provider: 'flutterwave',
    provider_ref: ref,
    amount_cents: amountCents,
    currency: 'usd',
    status: 'completed',
    raw: rawPayload && typeof rawPayload === 'object' ? rawPayload : { tx_ref: ref },
  });

  return { ok: true, booking_id: booking.id };
}

/**
 * Start booking deposit via Flutterwave v4 Uganda mobile money (push / payment_instruction — no hosted checkout URL).
 */
paymentsRouter.post('/create-checkout-session', async (req, res) => {
  try {
    const { bookingId, phone, provider } = req.body ?? {};
    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId required' });
    }
    const phoneStr = String(phone ?? '').trim();
    const prov = String(provider ?? '').toLowerCase();
    if (!phoneStr) {
      return res.status(400).json({ error: 'phone required for mobile money deposit' });
    }
    if (prov !== 'mtn' && prov !== 'airtel') {
      return res.status(400).json({ error: 'provider must be mtn or airtel' });
    }

    const sb = createServiceClient();
    const { data: row, error } = await sb
      .from('bookings')
      .select('id,user_id,amount_cents,service_name,payment_status')
      .eq('id', bookingId)
      .single();

    if (error || !row) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (row.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your booking' });
    }
    if (row.payment_status === 'paid') {
      return res.status(400).json({ error: 'Already paid' });
    }

    const amountCents = row.amount_cents && row.amount_cents > 0 ? row.amount_cents : 4500;
    const rate = Number(process.env.FLUTTERWAVE_BOOKING_USD_TO_UGX || 3850);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(500).json({ error: 'FLUTTERWAVE_BOOKING_USD_TO_UGX is invalid' });
    }
    const amountUgx = Math.max(1000, Math.round((Number(amountCents) / 100) * rate));

    const txRef = `bk-${row.id}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const { data: u } = await sb.from('users').select('email,name').eq('id', req.user.id).maybeSingle();
    const customerEmail =
      u?.email && String(u.email).includes('@') ? String(u.email).trim() : `user.${String(req.user.id).slice(0, 8)}@autexa.app`;
    const customerName = (u?.name && String(u.name).trim()) || 'Gearup customer';

    const network = flutterwave.providerToNetwork(prov);
    const fwRes = await flutterwave.chargeUgandaMobileMoney({
      amountUgx,
      phone: phoneStr,
      network,
      txRef,
      email: customerEmail,
      fullname: customerName,
      meta: { booking_id: String(row.id), user_id: String(row.user_id) },
    });

    const note = fwRes?.data?.next_action?.payment_instruction?.note;
    const instruction = typeof note === 'string' && note.trim() ? note.trim() : null;

    const patch = {
      flutterwave_tx_ref: txRef,
      payment_status: 'pending',
    };
    const { error: upBookingErr } = await sb.from('bookings').update(patch).eq('id', bookingId);
    if (upBookingErr) {
      if (/flutterwave_tx_ref/.test(upBookingErr.message) || upBookingErr.code === '42703') {
        return res.status(500).json({
          error: 'Database missing flutterwave_tx_ref column. Apply Supabase migration 20260410320000_booking_flutterwave.sql.',
        });
      }
      throw new Error(upBookingErr.message);
    }

    const message =
      instruction ||
      `Approve the deposit (${amountUgx.toLocaleString()} UGX) on ${phoneStr}. We will confirm when payment completes.`;

    res.json({
      url: null,
      txRef,
      sessionId: txRef,
      message,
      instruction,
      amountUgx,
    });
  } catch (e) {
    console.error('[POST /payments/create-checkout-session]', e);
    res.status(500).json({ error: e?.message || 'Could not start payment' });
  }
});
