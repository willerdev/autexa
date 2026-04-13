import crypto from 'crypto';
import { createServiceClient } from '../lib/supabase.js';
import * as flutterwave from '../lib/flutterwave.js';
// Direct carrier APIs retired — use Flutterwave (UG mobile money).
// import * as mtn from '../lib/momo.js';
// import * as airtel from '../lib/airtel.js';

function sb() {
  return createServiceClient();
}

function stubPayments() {
  return process.env.WALLET_PAYMENTS_STUB === '1';
}

/**
 * Best-effort MTN vs Airtel from Uganda MSISDN (0XXXXXXXXX, 256…, +256…).
 * @returns {'mtn'|'airtel'|null}
 */
export function inferUgandaMomoProviderFromPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  let nsn = digits;
  if (digits.startsWith('256')) nsn = digits.slice(3);
  else if (digits.startsWith('0')) nsn = digits.slice(1);
  if (nsn.length < 9) return null;
  const pre = nsn.slice(0, 3);
  const mtn = new Set(['031', '039', '076', '077', '078', '079']);
  const airtel = new Set(['070', '074', '075']);
  if (mtn.has(pre)) return 'mtn';
  if (airtel.has(pre)) return 'airtel';
  return null;
}

async function getUserEmailForPayments(userId) {
  const { data } = await sb().from('users').select('email').eq('id', userId).maybeSingle();
  const e = String(data?.email ?? '').trim();
  if (e && e.includes('@')) return e;
  return `user.${String(userId).slice(0, 8)}@autexa.app`;
}

/** Idempotent: credit wallet for a pending top-up when Flutterwave reports success (webhook or verify). */
export async function completePendingTopupByTxRef(txRef) {
  const supabase = sb();
  const ref = String(txRef ?? '').trim();
  if (!ref) return { ok: false, reason: 'missing tx_ref' };

  const { data: request, error } = await supabase
    .from('topup_requests')
    .select('*')
    .eq('external_reference', ref)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) return { ok: false, reason: 'topup not found' };
  if (request.status === 'success') return { ok: true, already_done: true };
  if (request.status !== 'pending') return { ok: false, reason: request.status };

  const { data: locked } = await supabase
    .from('topup_requests')
    .update({ status: 'success', completed_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!locked) return { ok: true, already_done: true };

  await creditWallet({
    userId: request.user_id,
    amount: request.amount,
    description: `Top-up via Flutterwave (${String(request.provider).toUpperCase()})`,
    paymentMethod: 'flutterwave',
    momoPhone: request.phone,
    momoProvider: request.provider,
    momoReference: ref,
  });
  return { ok: true, user_id: request.user_id, amount: request.amount };
}

export async function getWallet(userId) {
  const { data, error } = await sb().from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { error: insErr } = await sb().from('wallets').insert({ user_id: userId });
    if (insErr && insErr.code !== '23505') throw new Error(insErr.message);
    const { data: again, error: selErr } = await sb().from('wallets').select('*').eq('user_id', userId).single();
    if (selErr || !again) throw new Error(selErr?.message || 'Wallet not found');
    return again;
  }
  return data;
}

export async function depositToSavings({ userId, amount, description }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount must be positive');
  const supabase = sb();
  const { data, error } = await supabase.rpc('transfer_wallet_to_savings', {
    p_user_id: userId,
    p_amount: amt,
    p_description: description ? String(description) : null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function withdrawFromSavings({ userId, amount, description }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount must be positive');
  const supabase = sb();
  const { data, error } = await supabase.rpc('transfer_savings_to_wallet', {
    p_user_id: userId,
    p_amount: amt,
    p_description: description ? String(description) : null,
  });
  if (error) throw new Error(error.message);
  return data;
}

function randomLinkSlug() {
  return crypto.randomBytes(9).toString('base64url').replace(/=/g, '').slice(0, 12).toLowerCase();
}

export async function createPaymentLink({ ownerUserId, title, suggestedAmountUgx, expiresAt }) {
  await getWallet(ownerUserId);
  const ttl = expiresAt ? new Date(expiresAt) : null;
  if (ttl && Number.isNaN(ttl.getTime())) throw new Error('Invalid expires_at');
  const sug =
    suggestedAmountUgx == null || suggestedAmountUgx === ''
      ? null
      : Number(suggestedAmountUgx);
  if (sug != null && (!Number.isFinite(sug) || sug < 1000)) {
    throw new Error('Suggested amount must be at least 1,000 UGX');
  }
  for (let i = 0; i < 10; i += 1) {
    const slug = randomLinkSlug();
    const { data, error } = await sb()
      .from('wallet_payment_links')
      .insert({
        owner_user_id: ownerUserId,
        slug,
        title: title != null ? String(title).trim().slice(0, 120) || null : null,
        suggested_amount_ugx: sug,
        expires_at: ttl ? ttl.toISOString() : null,
      })
      .select('id, slug, title, suggested_amount_ugx, active, expires_at, created_at')
      .single();
    if (!error) return data;
    if (error.code !== '23505') throw new Error(error.message);
  }
  throw new Error('Could not create a unique link');
}

export async function listPaymentLinks(ownerUserId) {
  const { data, error } = await sb()
    .from('wallet_payment_links')
    .select('id, slug, title, suggested_amount_ugx, active, expires_at, created_at')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setPaymentLinkActive(ownerUserId, linkId, active) {
  const { data, error } = await sb()
    .from('wallet_payment_links')
    .update({ active: Boolean(active) })
    .eq('id', linkId)
    .eq('owner_user_id', ownerUserId)
    .select('id, active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Link not found');
  return data;
}

/** Safe fields for guests (no PII). */
export async function getPublicPaymentLinkBySlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!s || s.length > 64) return null;
  const { data, error } = await sb()
    .from('wallet_payment_links')
    .select('slug, title, suggested_amount_ugx, active, expires_at')
    .eq('slug', s)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.active) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return {
    slug: data.slug,
    title: data.title,
    suggested_amount_ugx: data.suggested_amount_ugx,
    expires_at: data.expires_at,
  };
}

export async function initiateGuestTopupForLink({ slug, amount, phone, provider }) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!s) throw new Error('Invalid link');
  const { data: link, error } = await sb()
    .from('wallet_payment_links')
    .select('id, owner_user_id, active, expires_at, suggested_amount_ugx')
    .eq('slug', s)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!link || !link.active) throw new Error('This payment link is not valid');
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw new Error('This payment link has expired');
  }
  const amt = Number(amount);
  const sug = link.suggested_amount_ugx != null ? Number(link.suggested_amount_ugx) : null;
  if (sug != null && Number.isFinite(sug) && sug >= 1000 && amt !== sug) {
    throw new Error(`This link requires exactly ${Math.round(sug).toLocaleString()} UGX`);
  }
  return initiateTopup({
    userId: link.owner_user_id,
    amount: amt,
    phone,
    provider,
    paymentLinkId: link.id,
  });
}

export async function initiateTopup({ userId, amount, phone, provider, paymentLinkId = null }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 1000) throw new Error('Minimum top-up is 1,000 UGX');
  if (amt > 5_000_000) throw new Error('Maximum top-up is 5,000,000 UGX');
  const p = String(provider || '').toLowerCase();
  let prov = p === 'auto' || !p ? null : p;
  if (prov && prov !== 'mtn' && prov !== 'airtel') throw new Error('provider must be mtn, airtel, or auto');
  if (!prov) {
    const inferred = inferUgandaMomoProviderFromPhone(phone);
    if (inferred) prov = inferred;
  }

  await getWallet(userId);
  const externalId = crypto.randomUUID();

  const insertRow = {
    user_id: userId,
    amount: amt,
    phone: String(phone).trim(),
    provider: prov || 'auto',
    external_reference: externalId,
  };
  if (paymentLinkId) insertRow.payment_link_id = paymentLinkId;

  const { data: topupRequest, error: insErr } = await sb()
    .from('topup_requests')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);

  let instructionNote = '';
  try {
    const network = prov ? flutterwave.providerToNetwork(prov) : null;
    const email = await getUserEmailForPayments(userId);
    const fwRes = await flutterwave.chargeUgandaMobileMoney({
      amountUgx: amt,
      phone,
      network,
      txRef: externalId,
      email,
      fullname: 'Autexa wallet',
    });
    const n = fwRes?.data?.next_action?.payment_instruction?.note;
    if (typeof n === 'string' && n.trim()) instructionNote = n.trim();
    // Legacy direct APIs (commented):
    // if (p === 'mtn') await mtn.requestMtnCollection({ amount: amt, phone, externalId, description: 'Autexa Wallet Top-up' });
    // else await airtel.requestAirtelCollection({ amount: amt, phone, externalId, description: 'Autexa Wallet Top-up' });
  } catch (e) {
    await sb().from('topup_requests').update({ status: 'failed' }).eq('id', topupRequest.id);
    throw new Error(e?.response?.data?.message || e?.message || 'Flutterwave top-up request failed');
  }

  return {
    success: true,
    topupRequestId: topupRequest.id,
    reference: externalId,
    message:
      instructionNote ||
      `A payment prompt has been sent to ${phone}. Approve it on your phone to complete top-up.`,
    expiresIn: '15 minutes',
  };
}

export async function creditWallet({
  userId,
  amount,
  description,
  paymentMethod,
  momoPhone,
  momoProvider,
  momoReference,
}) {
  const supabase = sb();
  const wallet = await getWallet(userId);
  const before = Number(wallet.balance);
  const add = Number(amount);
  const after = before + add;

  const { error: wErr } = await supabase
    .from('wallets')
    .update({ balance: after, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (wErr) throw new Error(wErr.message);

  const { error: tErr } = await supabase.from('transactions').insert({
    wallet_id: wallet.id,
    user_id: userId,
    type: 'topup',
    amount: add,
    fee: 0,
    balance_before: before,
    balance_after: after,
    payment_method: paymentMethod || 'flutterwave',
    momo_phone: momoPhone,
    momo_provider: momoProvider,
    momo_reference: momoReference,
    description: description || 'Wallet top-up',
    initiated_by: 'user',
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
  if (tErr) throw new Error(tErr.message);
}

export async function checkTopupStatus({ topupRequestId, userId }) {
  const supabase = sb();
  const { data: request, error } = await supabase
    .from('topup_requests')
    .select('*')
    .eq('id', topupRequestId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error('Top-up request not found');

  if (request.status === 'success') {
    return { status: 'success', already_credited: true };
  }
  if (request.status === 'failed') {
    return { status: 'failed', reason: 'Payment was declined or failed' };
  }
  if (new Date() > new Date(request.expires_at)) {
    await supabase.from('topup_requests').update({ status: 'expired' }).eq('id', request.id).eq('status', 'pending');
    return { status: 'expired' };
  }

  if (stubPayments()) {
    const { data: locked } = await supabase
      .from('topup_requests')
      .update({ status: 'success', completed_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select('id, amount, phone, provider, external_reference')
      .maybeSingle();
    if (locked) {
      await creditWallet({
        userId,
        amount: request.amount,
        description: `Top-up via Flutterwave (${request.provider.toUpperCase()})`,
        paymentMethod: 'flutterwave',
        momoPhone: request.phone,
        momoProvider: request.provider,
        momoReference: request.external_reference,
      });
      return { status: 'success', amount: request.amount };
    }
    return { status: 'success', already_credited: true };
  }

  try {
    const verified = await flutterwave.verifyTransactionByTxRef(request.external_reference);
    const d = verified?.data;
    const st = String(d?.status || d?.processor_response || '').toLowerCase();
    const isSuccess = st === 'successful' || st === 'success' || st === 'succeeded';

    if (isSuccess) {
      const { data: locked } = await supabase
        .from('topup_requests')
        .update({ status: 'success', completed_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (locked) {
        await creditWallet({
          userId,
          amount: request.amount,
          description: `Top-up via Flutterwave (${request.provider.toUpperCase()})`,
          paymentMethod: 'flutterwave',
          momoPhone: request.phone,
          momoProvider: request.provider,
          momoReference: request.external_reference,
        });
      }
      return { status: 'success', amount: request.amount };
    }

    return { status: 'pending', message: 'Waiting for payment confirmation…' };
  } catch {
    return { status: 'pending', message: 'Checking payment status…' };
  }
}

/** Poll top-up status for a payment started via a public payment link (no auth). */
export async function checkGuestTopupStatus(topupRequestId) {
  const supabase = sb();
  const { data: request, error } = await supabase
    .from('topup_requests')
    .select('*')
    .eq('id', topupRequestId)
    .not('payment_link_id', 'is', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) throw new Error('Top-up request not found');

  const userId = request.user_id;

  if (request.status === 'success') {
    return { status: 'success', already_credited: true };
  }
  if (request.status === 'failed') {
    return { status: 'failed', reason: 'Payment was declined or failed' };
  }
  if (new Date() > new Date(request.expires_at)) {
    await supabase.from('topup_requests').update({ status: 'expired' }).eq('id', request.id).eq('status', 'pending');
    return { status: 'expired' };
  }

  if (stubPayments()) {
    const { data: locked } = await supabase
      .from('topup_requests')
      .update({ status: 'success', completed_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select('id, amount, phone, provider, external_reference')
      .maybeSingle();
    if (locked) {
      await creditWallet({
        userId,
        amount: request.amount,
        description: `Top-up via Flutterwave (${request.provider.toUpperCase()})`,
        paymentMethod: 'flutterwave',
        momoPhone: request.phone,
        momoProvider: request.provider,
        momoReference: request.external_reference,
      });
      return { status: 'success', amount: request.amount };
    }
    return { status: 'success', already_credited: true };
  }

  try {
    const verified = await flutterwave.verifyTransactionByTxRef(request.external_reference);
    const d = verified?.data;
    const st = String(d?.status || d?.processor_response || '').toLowerCase();
    const isSuccess = st === 'successful' || st === 'success' || st === 'succeeded';

    if (isSuccess) {
      const { data: locked } = await supabase
        .from('topup_requests')
        .update({ status: 'success', completed_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (locked) {
        await creditWallet({
          userId,
          amount: request.amount,
          description: `Top-up via Flutterwave (${request.provider.toUpperCase()})`,
          paymentMethod: 'flutterwave',
          momoPhone: request.phone,
          momoProvider: request.provider,
          momoReference: request.external_reference,
        });
      }
      return { status: 'success', amount: request.amount };
    }

    return { status: 'pending', message: 'Waiting for payment confirmation…' };
  } catch {
    return { status: 'pending', message: 'Checking payment status…' };
  }
}

export async function initiateWithdrawal({ userId, amount, phone, provider }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 2000) throw new Error('Minimum withdrawal is 2,000 UGX');

  const FEE_PCT = Number(process.env.WALLET_WITHDRAW_FEE_PCT || 0.015);
  const fee = Math.round(amt * FEE_PCT * 100) / 100;
  const totalDeducted = amt + fee;
  const p = String(provider || '').toLowerCase();
  let prov = p === 'auto' || !p ? null : p;
  if (prov && prov !== 'mtn' && prov !== 'airtel') throw new Error('provider must be mtn, airtel, or auto');
  if (!prov) {
    const inferred = inferUgandaMomoProviderFromPhone(phone);
    if (inferred) prov = inferred;
  }

  const supabase = sb();
  const wallet = await getWallet(userId);
  if (wallet.is_locked) throw new Error(wallet.locked_reason ? `Wallet locked: ${wallet.locked_reason}` : 'Wallet locked');
  if (Number(wallet.balance) < totalDeducted) {
    throw new Error(
      `Insufficient balance. Need ${totalDeducted} UGX (incl. ${fee} fee). Available: ${wallet.balance} UGX`,
    );
  }

  const before = Number(wallet.balance);
  const after = before - totalDeducted;
  const externalId = crypto.randomUUID();

  const { error: wErr } = await supabase
    .from('wallets')
    .update({ balance: after, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (wErr) throw new Error(wErr.message);

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: 'withdrawal',
      amount: amt,
      fee,
      balance_before: before,
      balance_after: after,
      payment_method: 'flutterwave',
      momo_phone: String(phone).trim(),
      momo_provider: prov || 'auto',
      description: `Withdrawal via Flutterwave (${(prov || 'auto').toUpperCase()}) ${phone}`,
      initiated_by: 'user',
      status: 'pending',
    })
    .select('id')
    .single();
  if (txErr) throw new Error(txErr.message);

  const { data: withdrawalReq, error: wrErr } = await supabase
    .from('withdrawal_requests')
    .insert({
      user_id: userId,
      wallet_id: wallet.id,
      amount: amt,
      fee,
      net_amount: amt,
      phone: String(phone).trim(),
      provider: prov || 'auto',
      external_reference: externalId,
      status: 'processing',
    })
    .select('id')
    .single();
  if (wrErr) throw new Error(wrErr.message);

  try {
    const network = prov ? flutterwave.providerToNetwork(prov) : null;
    await flutterwave.createUgMobileMoneyTransfer({
      amountUgx: amt,
      phone,
      network,
      reference: externalId,
      narration: 'Autexa Withdrawal',
      beneficiaryName: 'Autexa user',
    });
    // Legacy:
    // if (p === 'mtn') await mtn.requestMtnDisbursement({ amount: amt, phone, externalId, description: 'Autexa Withdrawal' });
    // else await airtel.requestAirtelDisbursement({ amount: amt, phone, externalId, description: 'Autexa Withdrawal' });

    await supabase
      .from('withdrawal_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', withdrawalReq.id);

    await supabase
      .from('transactions')
      .update({
        status: 'completed',
        momo_reference: externalId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    return {
      success: true,
      amount: amt,
      fee,
      net: amt,
      message: `${amt.toLocaleString()} UGX has been sent to ${phone}`,
    };
  } catch (e) {
    await supabase
      .from('wallets')
      .update({ balance: before, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    const msg = e?.response?.data?.message || e?.message || 'Disbursement failed';
    await supabase.from('transactions').update({ status: 'failed', failure_reason: msg }).eq('id', tx.id);
    await supabase.from('withdrawal_requests').update({ status: 'failed', failure_reason: msg }).eq('id', withdrawalReq.id);

    throw new Error(`Withdrawal failed: ${msg}. Your wallet was refunded.`);
  }
}

export async function transferToProvider({
  fromUserId,
  toUserId,
  amount,
  description,
  bookingId,
  initiatedBy = 'user',
}) {
  const supabase = sb();
  const { data, error } = await supabase.rpc('transfer_between_wallets', {
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
    p_amount: Number(amount),
    p_description: description || 'Wallet payment',
    p_booking_id: bookingId || null,
    p_initiated_by: initiatedBy,
  });
  if (error) throw new Error(error.message);
  const result = data;
  if (!result?.success) throw new Error(result?.error || 'Transfer failed');
  return result;
}

export async function listPayees(ownerUserId) {
  const { data, error } = await sb()
    .from('wallet_payees')
    .select('id, label, payee_user_id, provider_id, created_at, providers(name)')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addPayee({ ownerUserId, label, providerId, payeeUserId }) {
  const lbl = String(label ?? '').trim();
  if (!lbl) throw new Error('label is required');
  const hasProv = providerId != null && String(providerId).trim() !== '';
  const hasUser = payeeUserId != null && String(payeeUserId).trim() !== '';
  if (!hasProv && !hasUser) throw new Error('Provide providerId or payeeUserId');
  if (hasProv && hasUser) throw new Error('Provide only one of providerId or payeeUserId');

  let pid = hasProv ? String(providerId).trim() : null;
  let puid = hasUser ? String(payeeUserId).trim() : null;

  if (pid) {
    const { data: prov, error: pe } = await sb().from('providers').select('id, user_id').eq('id', pid).maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!prov?.user_id) throw new Error('Provider has no linked user account');
    puid = prov.user_id;
  }

  if (puid === ownerUserId) throw new Error('You cannot add yourself as a payee');
  await getWallet(puid);

  const { data: inserted, error: insErr } = await sb()
    .from('wallet_payees')
    .insert({
      owner_user_id: ownerUserId,
      payee_user_id: puid,
      provider_id: pid,
      label: lbl,
    })
    .select('id, label, payee_user_id, provider_id, created_at')
    .single();
  if (insErr) {
    if (insErr.code === '23505') throw new Error('This person is already in your payee list');
    throw new Error(insErr.message);
  }
  return inserted;
}

export async function removePayee(ownerUserId, payeeRowId) {
  const { data: row } = await sb()
    .from('wallet_payees')
    .select('id')
    .eq('id', payeeRowId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (!row) throw new Error('Payee not found');
  const { error } = await sb().from('wallet_payees').delete().eq('id', payeeRowId).eq('owner_user_id', ownerUserId);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function transferToSavedPayee({ ownerUserId, payeeRowId, amount, description, initiatedBy = 'user' }) {
  const { data: row, error } = await sb()
    .from('wallet_payees')
    .select('id, payee_user_id, label')
    .eq('id', payeeRowId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Payee not found');
  return transferToProvider({
    fromUserId: ownerUserId,
    toUserId: row.payee_user_id,
    amount,
    description: description || `Send to ${row.label}`,
    bookingId: null,
    initiatedBy,
  });
}

export async function saveWalletAiMemory(userId, note) {
  const trimmed = String(note ?? '').trim().slice(0, 4000);
  const supabase = sb();
  const { data: existing } = await supabase.from('user_ai_context').select('id').eq('user_id', userId).maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('user_ai_context').update({ wallet_memory: trimmed }).eq('user_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('user_ai_context').insert({ user_id: userId, wallet_memory: trimmed });
    if (error) throw new Error(error.message);
  }
  return { success: true };
}
