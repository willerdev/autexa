import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { createServiceClient } from '../lib/supabase.js';
import * as walletService from '../services/walletService.js';

export const savingsChallengesRouter = Router();
savingsChallengesRouter.use(requireUser);

function nowIso() {
  return new Date().toISOString();
}

function mustUuid(id) {
  const s = String(id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    throw new Error('Invalid id');
  }
  return s;
}

async function ensureAcceptedMember(sb, challengeId, userId) {
  const { data, error } = await sb
    .from('savings_challenge_members')
    .select('id,status')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== 'accepted') throw new Error('Not a challenge member');
  return data;
}

async function ensureCreator(sb, challengeId, userId) {
  const { data, error } = await sb
    .from('savings_challenges')
    .select('id,creator_user_id')
    .eq('id', challengeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Challenge not found');
  if (data.creator_user_id !== userId) throw new Error('Not authorized');
  return data;
}

async function computeLeaderboard(sb, challengeId) {
  const { data, error } = await sb
    .from('savings_challenge_contributions')
    .select('user_id, amount, created_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const sums = new Map();
  for (const r of data ?? []) {
    const uid = r.user_id;
    const prev = sums.get(uid) || 0;
    sums.set(uid, prev + Number(r.amount || 0));
  }

  const { data: members, error: mErr } = await sb
    .from('savings_challenge_members')
    .select('user_id,status,role,joined_at')
    .eq('challenge_id', challengeId);
  if (mErr) throw new Error(mErr.message);

  const rows = (members ?? [])
    .filter((m) => m.status === 'accepted')
    .map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      contributed: sums.get(m.user_id) || 0,
    }))
    .sort((a, b) => Number(b.contributed) - Number(a.contributed));

  return rows;
}

async function finalizeIfExpired(sb, challenge) {
  if (challenge.status === 'ended') return challenge;
  if (new Date(challenge.ends_at) > new Date()) return challenge;
  const { data: updated, error } = await sb
    .from('savings_challenges')
    .update({ status: 'ended' })
    .eq('id', challenge.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return updated ?? { ...challenge, status: 'ended' };
}

async function maybeAwardWinner(sb, challengeId) {
  // lock row
  const { data: ch, error } = await sb.from('savings_challenges').select('*').eq('id', challengeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!ch) throw new Error('Challenge not found');
  if (ch.status !== 'active' || ch.winner_user_id) return { updated: false };

  const leaderboard = await computeLeaderboard(sb, challengeId);
  if (!leaderboard.length) return { updated: false };

  const target = Number(ch.target_amount || 0);
  const start = Number(ch.starting_amount || 0);
  const reached = leaderboard
    .map((r) => ({ ...r, total: Number(r.contributed || 0) + start }))
    .filter((r) => r.total >= target);
  if (!reached.length) return { updated: false };

  // Winner = earliest contribution time when they crossed target.
  const { data: contribs, error: cErr } = await sb
    .from('savings_challenge_contributions')
    .select('user_id, amount, created_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true });
  if (cErr) throw new Error(cErr.message);

  const crossedAt = new Map();
  const running = new Map();
  for (const row of contribs ?? []) {
    const uid = row.user_id;
    const prev = running.get(uid) || 0;
    const next = prev + Number(row.amount || 0);
    running.set(uid, next);
    const total = next + start;
    if (total >= target && !crossedAt.has(uid)) {
      crossedAt.set(uid, row.created_at);
    }
  }
  let winner = null;
  for (const uid of crossedAt.keys()) {
    const at = new Date(crossedAt.get(uid)).getTime();
    if (!winner || at < winner.at) winner = { uid, at };
  }
  if (!winner) return { updated: false };

  // total contributions for reward calc
  const total = (contribs ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const bonus = Math.round(total * 0.1 * 100) / 100;

  // End challenge with winner (idempotent lock via where winner_user_id is null)
  const { data: ended, error: endErr } = await sb
    .from('savings_challenges')
    .update({
      status: 'ended',
      winner_user_id: winner.uid,
      total_contributed: total,
    })
    .eq('id', challengeId)
    .is('winner_user_id', null)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (endErr) throw new Error(endErr.message);
  if (!ended) return { updated: false };

  // Credit winner wallet with a system transaction (house-funded bonus)
  const wallet = await walletService.getWallet(winner.uid);
  const before = Number(wallet.balance);
  const after = before + bonus;
  await sb.from('wallets').update({ balance: after, updated_at: nowIso() }).eq('user_id', winner.uid);
  await sb.from('transactions').insert({
    wallet_id: wallet.id,
    user_id: winner.uid,
    type: 'challenge_reward',
    amount: bonus,
    fee: 0,
    balance_before: before,
    balance_after: after,
    payment_method: 'system',
    description: `Savings challenge reward (10% bonus)`,
    initiated_by: 'system',
    status: 'completed',
    completed_at: nowIso(),
    metadata: { challenge_id: challengeId, total_contributed: total, pct: 0.1 },
  });

  return { updated: true, winner_user_id: winner.uid, bonus, total_contributed: total };
}

savingsChallengesRouter.post('/', async (req, res) => {
  try {
    const { title, targetAmount, startingAmount, endsAt } = req.body ?? {};
    const t = Number(targetAmount);
    const start = startingAmount == null ? 0 : Number(startingAmount);
    const end = new Date(String(endsAt));
    if (!Number.isFinite(t) || t < 1000) return res.status(400).json({ error: 'targetAmount must be >= 1000' });
    if (!Number.isFinite(start) || start < 0) return res.status(400).json({ error: 'startingAmount must be >= 0' });
    if (Number.isNaN(end.getTime())) return res.status(400).json({ error: 'endsAt is required' });
    if (end <= new Date()) return res.status(400).json({ error: 'endsAt must be in the future' });

    const sb = createServiceClient();
    const { data: row, error } = await sb
      .from('savings_challenges')
      .insert({
        creator_user_id: req.user.id,
        title: title ? String(title).trim().slice(0, 120) : 'Savings challenge',
        target_amount: t,
        starting_amount: start,
        ends_at: end.toISOString(),
        status: 'active',
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await sb.from('savings_challenge_members').insert({
      challenge_id: row.id,
      user_id: req.user.id,
      role: 'creator',
      status: 'accepted',
      invited_by_user_id: req.user.id,
      joined_at: nowIso(),
    });

    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Could not create challenge' });
  }
});

savingsChallengesRouter.get('/', async (req, res) => {
  try {
    const sb = createServiceClient();
    const { data: memberships, error } = await sb
      .from('savings_challenge_members')
      .select('challenge_id,status,role,created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const ids = (memberships ?? []).map((m) => m.challenge_id);
    if (!ids.length) return res.json({ data: [] });
    const { data: challenges, error: cErr } = await sb
      .from('savings_challenges')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });
    if (cErr) throw new Error(cErr.message);
    res.json({ data: challenges ?? [] });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load challenges' });
  }
});

savingsChallengesRouter.get('/:id', async (req, res) => {
  try {
    const id = mustUuid(req.params.id);
    const sb = createServiceClient();
    const { data: challenge, error } = await sb.from('savings_challenges').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    // auth: must be member
    const { data: mem, error: mErr } = await sb
      .from('savings_challenge_members')
      .select('id,status')
      .eq('challenge_id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!mem) return res.status(403).json({ error: 'Not authorized' });

    const finalized = await finalizeIfExpired(sb, challenge);
    if (finalized.status === 'active') {
      await maybeAwardWinner(sb, id);
    }
    const leaderboard = await computeLeaderboard(sb, id);
    res.json({ challenge: finalized, leaderboard });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Failed to load challenge' });
  }
});

savingsChallengesRouter.post('/:id/invite', async (req, res) => {
  try {
    const id = mustUuid(req.params.id);
    const { userId } = req.body ?? {};
    const invitee = mustUuid(userId);
    const sb = createServiceClient();
    await ensureCreator(sb, id, req.user.id);

    const { data, error } = await sb
      .from('savings_challenge_members')
      .upsert(
        {
          challenge_id: id,
          user_id: invitee,
          role: 'member',
          status: 'invited',
          invited_by_user_id: req.user.id,
        },
        { onConflict: 'challenge_id,user_id' },
      )
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Invite failed' });
  }
});

savingsChallengesRouter.post('/:id/accept', async (req, res) => {
  try {
    const id = mustUuid(req.params.id);
    const sb = createServiceClient();
    const { data: row, error } = await sb
      .from('savings_challenge_members')
      .update({ status: 'accepted', joined_at: nowIso() })
      .eq('challenge_id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'invited')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return res.status(400).json({ error: 'No pending invite found' });
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Accept failed' });
  }
});

savingsChallengesRouter.post('/:id/contribute', async (req, res) => {
  try {
    const id = mustUuid(req.params.id);
    const { amount, source } = req.body ?? {};
    const amt = Number(amount);
    const src = String(source || 'wallet').toLowerCase();
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be positive' });
    if (src !== 'wallet' && src !== 'savings') return res.status(400).json({ error: 'source must be wallet|savings' });

    const sb = createServiceClient();
    await ensureAcceptedMember(sb, id, req.user.id);

    const { data: challenge, error: cErr } = await sb.from('savings_challenges').select('*').eq('id', id).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    const finalized = await finalizeIfExpired(sb, challenge);
    if (finalized.status !== 'active') return res.status(400).json({ error: 'Challenge has ended' });

    // Move funds into savings bucket first (so “challenge savings” is reflected). Wallet->savings is required for wallet source.
    if (src === 'wallet') {
      await walletService.depositToSavings({
        userId: req.user.id,
        amount: amt,
        description: `Challenge contribution (${id})`,
      });
    }

    // Record contribution (challenge pot accounting)
    const { data: contrib, error: insErr } = await sb
      .from('savings_challenge_contributions')
      .insert({ challenge_id: id, user_id: req.user.id, amount: amt, source: src })
      .select('*')
      .single();
    if (insErr) throw new Error(insErr.message);

    // Update challenge totals
    const { error: upErr } = await sb
      .from('savings_challenges')
      .update({ total_contributed: Number(finalized.total_contributed || 0) + amt })
      .eq('id', id);
    if (upErr) throw new Error(upErr.message);

    const win = await maybeAwardWinner(sb, id);
    res.status(201).json({ contribution: contrib });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Contribute failed' });
  }
});

