import crypto from 'crypto';
import { createServiceClient } from '../lib/supabase.js';
import * as flutterwave from '../lib/flutterwave.js';

function nowIso() {
  return new Date().toISOString();
}

function periodKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

export async function getOrInitSubscription(userId) {
  const sb = createServiceClient();
  const { data, error } = await sb.from('user_subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: ins, error: insErr } = await sb
    .from('user_subscriptions')
    .insert({ user_id: userId, plan: 'free', status: 'active' })
    .select('*')
    .single();
  if (insErr) throw new Error(insErr.message);
  return ins;
}

export async function getUsage(userId, yyyymm = periodKey()) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('usage_counters')
    .select('*')
    .eq('user_id', userId)
    .eq('period_yyyymm', yyyymm)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: ins, error: insErr } = await sb
    .from('usage_counters')
    .insert({ user_id: userId, period_yyyymm: yyyymm })
    .select('*')
    .single();
  if (insErr) throw new Error(insErr.message);
  return ins;
}

export async function incrementUsage(userId, field, n = 1, yyyymm = periodKey()) {
  const sb = createServiceClient();
  const cur = await getUsage(userId, yyyymm);
  const next = Number(cur[field] || 0) + n;
  const { error } = await sb
    .from('usage_counters')
    .update({ [field]: next, updated_at: nowIso() })
    .eq('id', cur.id);
  if (error) throw new Error(error.message);
  return next;
}

export function planLimits(plan) {
  const p = String(plan || 'free').toLowerCase();
  if (p === 'professional') return { aiMonthly: 10_000, smsAllowed: true };
  return { aiMonthly: 20, smsAllowed: false };
}

export async function requireAiQuota(userId) {
  const sub = await getOrInitSubscription(userId);
  const plan = String(sub.plan || 'free').toLowerCase();
  const limits = planLimits(plan);
  const usage = await getUsage(userId);
  if (Number(usage.ai_requests_count || 0) >= limits.aiMonthly) {
    const msg =
      plan === 'free'
        ? 'Free plan limit reached (20 AI requests this month). Upgrade to Professional.'
        : 'AI usage limit reached. Please contact support.';
    const err = new Error(msg);
    err.statusCode = 402;
    throw err;
  }
  await incrementUsage(userId, 'ai_requests_count', 1);
  return { plan, remaining: Math.max(0, limits.aiMonthly - (Number(usage.ai_requests_count || 0) + 1)) };
}

export async function requireSmsAccess(userId) {
  const sub = await getOrInitSubscription(userId);
  const plan = String(sub.plan || 'free').toLowerCase();
  const limits = planLimits(plan);
  if (!limits.smsAllowed) {
    const err = new Error('SMS sending is available on the Professional plan only.');
    err.statusCode = 402;
    throw err;
  }
  await incrementUsage(userId, 'sms_sends_count', 1);
  return { plan };
}

export async function startProfessionalSubscription({ userId, phone, provider }) {
  const sb = createServiceClient();
  const txRef = `sub_${crypto.randomUUID()}`;
  const amountUgx = 30_000;

  const fwRes = await flutterwave.chargeUgandaMobileMoney({
    amountUgx,
    phone,
    network: provider ? flutterwave.providerToNetwork(provider) : null,
    txRef,
    email: 'customer@autexa.app',
    fullname: 'Autexa subscription',
    meta: { kind: 'subscription_professional', user_id: userId },
  });

  const instruction = fwRes?.data?.next_action?.payment_instruction?.note || null;
  const now = nowIso();
  await sb
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        plan: 'professional',
        status: 'pending',
        flutterwave_tx_ref: txRef,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  return {
    txRef,
    amountUgx,
    instruction: typeof instruction === 'string' ? instruction.trim() : null,
    message:
      (typeof instruction === 'string' && instruction.trim()) ||
      `Approve the subscription payment (${amountUgx.toLocaleString()} UGX) on ${phone}.`,
  };
}

export async function completeSubscriptionByTxRef(txRef, rawPayload = null) {
  const sb = createServiceClient();
  const ref = String(txRef || '').trim();
  if (!ref) return { ok: false };

  const { data: row, error } = await sb
    .from('user_subscriptions')
    .select('*')
    .eq('flutterwave_tx_ref', ref)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, reason: 'not_found' };

  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  await sb
    .from('user_subscriptions')
    .update({
      status: 'active',
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      last_payment_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('user_id', row.user_id);

  return { ok: true, user_id: row.user_id, period_end: end.toISOString(), raw: rawPayload };
}

