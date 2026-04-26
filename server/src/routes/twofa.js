import { Router } from 'express';
import crypto from 'crypto';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { sendSmsIfConfigured } from '../lib/twilioSms.js';

export const twofaRouter = Router();
twofaRouter.use(requireUser);

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LEN = 6;

function nowIso() {
  return new Date().toISOString();
}

function otpSecret() {
  return String(process.env.TWOFA_OTP_SECRET || process.env.SUPABASE_JWT_SECRET || 'autexa-otp').trim();
}

function randomOtp() {
  const n = crypto.randomInt(0, 10 ** OTP_LEN);
  return String(n).padStart(OTP_LEN, '0');
}

function hashOtp(code, salt) {
  const h = crypto.createHash('sha256');
  h.update(String(code));
  h.update(':');
  h.update(String(salt));
  h.update(':');
  h.update(otpSecret());
  return h.digest('hex');
}

async function getUserPhone(sb, userId) {
  const { data, error } = await sb.from('users').select('phone,twofa_phone,twofa_enabled').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const phone = String(data?.twofa_phone || data?.phone || '').trim();
  return { phone, twofaEnabled: Boolean(data?.twofa_enabled) };
}

async function createOtpRow({ sb, userId, phone, purpose, ip }) {
  const code = randomOtp();
  const salt = crypto.randomBytes(12).toString('hex');
  const codeHash = hashOtp(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { data, error } = await sb
    .from('twofa_otps')
    .insert({
      user_id: userId,
      phone,
      purpose,
      code_hash: codeHash,
      salt,
      expires_at: expiresAt,
      request_ip: ip || null,
    })
    .select('id,expires_at')
    .single();
  if (error) throw new Error(error.message);
  return { otpId: data.id, expiresAt: data.expires_at, code };
}

async function rateLimitOtp(sb, userId, purpose) {
  // Max 4 OTPs per 15 minutes per purpose.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from('twofa_otps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((count || 0) >= 4) throw new Error('Too many OTP requests. Try again in a few minutes.');
}

async function sendOtpSms(phone, code, purpose) {
  const label = purpose === 'enable' ? 'enable 2FA' : purpose === 'disable' ? 'disable 2FA' : 'sign in';
  const body = `Gearup OTP: ${code}\nUse this code to ${label}. Expires in 5 minutes.`;
  const out = await sendSmsIfConfigured({ to: phone, body });
  if (out?.skipped) throw new Error('SMS is not available (Twilio not configured).');
  if (out?.error) throw new Error(out.error);
}

async function verifyOtp({ sb, otpId, userId, code, purpose }) {
  const c = String(code ?? '').trim();
  if (!/^[0-9]{6}$/.test(c)) throw new Error('Enter the 6-digit code.');

  const { data: row, error } = await sb
    .from('twofa_otps')
    .select('id,code_hash,salt,expires_at,consumed_at,attempts,purpose')
    .eq('id', otpId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('OTP session not found.');
  if (String(row.purpose) !== String(purpose)) throw new Error('OTP purpose mismatch.');
  if (row.consumed_at) throw new Error('OTP already used.');
  if (row.attempts != null && Number(row.attempts) >= 5) throw new Error('Too many attempts. Request a new code.');
  if (new Date() > new Date(row.expires_at)) throw new Error('OTP expired. Request a new code.');

  const want = String(row.code_hash);
  const got = hashOtp(c, String(row.salt));
  const ok = crypto.timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(got, 'hex'));
  if (!ok) {
    await sb.from('twofa_otps').update({ attempts: Number(row.attempts || 0) + 1 }).eq('id', row.id);
    throw new Error('Incorrect code.');
  }

  await sb.from('twofa_otps').update({ consumed_at: nowIso() }).eq('id', row.id).is('consumed_at', null);
  return true;
}

twofaRouter.get('/status', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { phone, twofaEnabled } = await getUserPhone(sb, req.user.id);
    res.json({ twofaEnabled, phone: phone || null });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Could not load 2FA status' });
  }
});

twofaRouter.post('/enable/start', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { phone, twofaEnabled } = await getUserPhone(sb, req.user.id);
    if (!phone) return res.status(400).json({ error: 'Add a phone number to your profile first.' });
    if (twofaEnabled) return res.json({ ok: true, alreadyEnabled: true });
    await rateLimitOtp(sb, req.user.id, 'enable');

    const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.ip;
    const { otpId, expiresAt, code } = await createOtpRow({ sb, userId: req.user.id, phone, purpose: 'enable', ip });
    await sendOtpSms(phone, code, 'enable');
    res.json({ ok: true, challengeId: otpId, expiresAt });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not start 2FA' });
  }
});

twofaRouter.post('/enable/confirm', async (req, res) => {
  try {
    const { challengeId, code } = req.body ?? {};
    if (!challengeId) return res.status(400).json({ error: 'challengeId is required' });
    const sb = createServiceClient();
    const { phone } = await getUserPhone(sb, req.user.id);
    if (!phone) return res.status(400).json({ error: 'Add a phone number to your profile first.' });

    await verifyOtp({ sb, otpId: String(challengeId), userId: req.user.id, code, purpose: 'enable' });
    await sb
      .from('users')
      .update({ twofa_enabled: true, twofa_phone: phone })
      .eq('id', req.user.id);
    res.json({ ok: true, twofaEnabled: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not enable 2FA' });
  }
});

twofaRouter.post('/challenge/start', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { phone, twofaEnabled } = await getUserPhone(sb, req.user.id);
    if (!twofaEnabled) return res.json({ ok: true, skipped: true });
    if (!phone) return res.status(400).json({ error: '2FA is enabled but no phone is set.' });
    await rateLimitOtp(sb, req.user.id, 'login');
    const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.ip;
    const { otpId, expiresAt, code } = await createOtpRow({ sb, userId: req.user.id, phone, purpose: 'login', ip });
    await sendOtpSms(phone, code, 'login');
    res.json({ ok: true, challengeId: otpId, expiresAt });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not start OTP' });
  }
});

twofaRouter.post('/challenge/verify', async (req, res) => {
  try {
    const { challengeId, code } = req.body ?? {};
    if (!challengeId) return res.status(400).json({ error: 'challengeId is required' });
    const sb = createServiceClient();
    await verifyOtp({ sb, otpId: String(challengeId), userId: req.user.id, code, purpose: 'login' });
    res.json({ ok: true, verified: true });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Invalid code' });
  }
});

