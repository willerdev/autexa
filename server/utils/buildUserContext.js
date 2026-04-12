import { createServiceClient } from '../src/lib/supabase.js';

function firstNameFromNameOrEmail(name, email) {
  const n = String(name ?? '').trim();
  if (n) return n.split(/\s+/)[0];
  const e = String(email ?? '').trim();
  if (e && e.includes('@')) return e.split('@')[0];
  return '';
}

export async function buildUserContext(userId) {
  const sb = createServiceClient();

  const [userRow, carsRes, bookingsRes, aiCtxRes, walletRes, payeesRes, learnedRes] = await Promise.all([
    sb.from('users').select('id,name,email').eq('id', userId).maybeSingle(),
    sb.from('cars').select('make,model,year,plate,created_at,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
    sb
      .from('bookings')
      .select('id,date,time,status,service_name,providers(name)')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5),
    sb
      .from('user_ai_context')
      .select('preferred_payment,preferred_location,notes,wallet_memory')
      .eq('user_id', userId)
      .maybeSingle(),
    sb.from('wallets').select('balance,currency,is_locked').eq('user_id', userId).maybeSingle(),
    sb
      .from('wallet_payees')
      .select('id,label,payee_user_id,provider_id,providers(name)')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25),
    sb
      .from('user_ai_learned_memories')
      .select('id,body,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const firstName = firstNameFromNameOrEmail(userRow?.data?.name, userRow?.data?.email);

  const cars = (carsRes.data ?? []).map((c) => ({
    make: c.make ?? '',
    model: c.model ?? '',
    year: c.year ?? '',
    mileage: null,
    last_service_date: null,
  }));

  const recentBookings = (bookingsRes.data ?? []).map((b) => ({
    service_name: b.service_name ?? null,
    provider_name: b.providers?.name ?? null,
    date: String(b.date ?? ''),
    status: String(b.status ?? ''),
  }));

  const w = walletRes.data;
  const wallet =
    w && w.balance != null
      ? {
          balance: Number(w.balance),
          currency: w.currency ?? 'UGX',
          is_locked: Boolean(w.is_locked),
          formatted: `${Number(w.balance).toLocaleString()} ${w.currency ?? 'UGX'}`,
        }
      : null;

  if (payeesRes.error) {
    console.warn('[buildUserContext] wallet_payees skipped:', payeesRes.error.message);
  }
  const savedPayees =
    payeesRes.error != null
      ? []
      : (payeesRes.data ?? []).map((p) => ({
          id: p.id,
          label: p.label,
          payee_user_id: p.payee_user_id,
          provider_id: p.provider_id,
          provider_name: p.providers?.name ?? null,
        }));

  if (aiCtxRes.error) {
    console.warn('[buildUserContext] user_ai_context skipped:', aiCtxRes.error.message);
  }
  const aiRow = aiCtxRes.error ? null : aiCtxRes.data;

  if (learnedRes.error) {
    console.warn('[buildUserContext] user_ai_learned_memories skipped:', learnedRes.error.message);
  }
  const learnedRows = learnedRes.error ? [] : learnedRes.data ?? [];
  const learnedMemories = learnedRows.map((r) => ({
    id: r.id,
    body: String(r.body ?? '').slice(0, 600),
    createdAt: r.created_at ?? '',
  }));

  return {
    user: { firstName },
    cars,
    recentBookings,
    preferredPayment: aiRow?.preferred_payment ?? '',
    preferredLocation: aiRow?.preferred_location ?? '',
    aiNotes: aiRow?.notes ?? '',
    walletMemory: aiRow?.wallet_memory ?? '',
    wallet,
    savedPayees,
    learnedMemories,
  };
}

