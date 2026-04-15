import { Router } from 'express';
import crypto from 'crypto';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import { creditWalletSystem } from '../services/walletService.js';

export const referralsRouter = Router();
referralsRouter.use(requireUser);

function normalizeCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function genCode() {
  // 8 chars base32-ish (no I/O confusion)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function ensureMyCode(sb, userId) {
  const { data: existing, error } = await sb.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing?.code) return String(existing.code);

  // Try a few times in case of rare collision.
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    const { error: insErr } = await sb.from('referral_codes').insert({ user_id: userId, code });
    if (!insErr) return code;
    if (String(insErr.code) === '23505') continue;
    throw new Error(insErr.message);
  }
  throw new Error('Could not generate referral code');
}

referralsRouter.get('/code', async (req, res) => {
  try {
    const sb = createServiceClient();
    const code = await ensureMyCode(sb, req.user.id);
    res.json({ code });
  } catch (e) {
    console.error('[GET /referrals/code]', e);
    res.status(500).json({ error: e?.message || 'Could not load referral code' });
  }
});

referralsRouter.post('/claim', async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code);
    if (!code) return res.status(400).json({ error: 'code is required' });

    const sb = createServiceClient();
    const { data: owner, error } = await sb
      .from('referral_codes')
      .select('user_id')
      .eq('code', code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!owner?.user_id) return res.status(404).json({ error: 'Referral code not found' });
    const referrerUserId = String(owner.user_id);
    if (referrerUserId === req.user.id) return res.status(400).json({ error: 'You cannot refer yourself' });

    // One referral per referred user (unique constraint); keep first claim.
    const { error: insErr } = await sb.from('referrals').insert({
      referrer_user_id: referrerUserId,
      referred_user_id: req.user.id,
      status: 'pending',
      metadata: { code },
    });
    if (insErr && String(insErr.code) !== '23505') throw new Error(insErr.message);

    res.json({ ok: true, referrerUserId });
  } catch (e) {
    console.error('[POST /referrals/claim]', e);
    res.status(400).json({ error: e?.message || 'Could not claim referral' });
  }
});

/**
 * Idempotent: credits the referrer once when the referred user is active.
 * Called by the mobile app after first sign-in / profile hydrate.
 */
referralsRouter.post('/maybe-credit', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { data: row, error } = await sb
      .from('referrals')
      .select('id,referrer_user_id,status,credited_at')
      .eq('referred_user_id', req.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.json({ ok: true, credited: false, reason: 'no_referral' });
    if (row.credited_at || String(row.status) === 'credited') {
      return res.json({ ok: true, credited: false, alreadyCredited: true });
    }

    // Lock referral row by conditional update (idempotent).
    const now = new Date().toISOString();
    const { data: locked, error: lockErr } = await sb
      .from('referrals')
      .update({ status: 'crediting' })
      .eq('id', row.id)
      .is('credited_at', null)
      .neq('status', 'credited')
      .select('id,referrer_user_id')
      .maybeSingle();
    if (lockErr) throw new Error(lockErr.message);
    if (!locked) return res.json({ ok: true, credited: false, alreadyCredited: true });

    await creditWalletSystem({
      userId: String(locked.referrer_user_id),
      amount: 500,
      type: 'referral_bonus',
      description: 'Referral bonus',
      metadata: { referred_user_id: req.user.id, referral_id: locked.id },
    });

    await sb
      .from('referrals')
      .update({ status: 'credited', credited_at: now })
      .eq('id', locked.id)
      .is('credited_at', null);

    res.json({ ok: true, credited: true, amount: 500 });
  } catch (e) {
    console.error('[POST /referrals/maybe-credit]', e);
    res.status(500).json({ error: e?.message || 'Could not credit referral' });
  }
});

