-- Autexa wallet: balances, MoMo top-up/withdraw tracking, atomic P2P transfers.
-- Client apps use the API (service role); RLS allows users to read their own wallet & transactions only.

-- ─────────────────────────────────────────
-- WALLETS
-- ─────────────────────────────────────────
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  balance numeric(12, 2) not null default 0.00,
  currency text not null default 'UGX',
  is_locked boolean not null default false,
  locked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_balance_non_negative check (balance >= 0)
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);

alter table public.wallets enable row level security;

-- Users may view their wallet only (no direct client updates — API uses service role).
drop policy if exists "Users see own wallet" on public.wallets;
create policy "Users see own wallet"
  on public.wallets for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users update own wallet" on public.wallets;

-- ─────────────────────────────────────────
-- Auto-create wallet for new auth users
-- ─────────────────────────────────────────
create or replace function public.create_wallet_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_user_created_create_wallet on auth.users;
create trigger on_user_created_create_wallet
  after insert on auth.users
  for each row
  execute function public.create_wallet_for_new_user();

-- Backfill existing auth users
insert into public.wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ─────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  counterparty_wallet_id uuid references public.wallets (id) on delete set null,
  counterparty_user_id uuid references auth.users (id) on delete set null,
  type text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'UGX',
  fee numeric(12, 2) not null default 0.00,
  net_amount numeric(12, 2) generated always as (amount - coalesce(fee, 0)) stored,
  balance_before numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  payment_method text,
  momo_phone text,
  momo_provider text,
  momo_reference text,
  momo_status text,
  description text,
  booking_id uuid references public.bookings (id) on delete set null,
  initiated_by text not null default 'user',
  status text not null default 'pending',
  failure_reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.transactions enable row level security;

drop policy if exists "Users see own transactions" on public.transactions;
create policy "Users see own transactions"
  on public.transactions for select to authenticated
  using (auth.uid() = user_id or auth.uid() = counterparty_user_id);

create index if not exists idx_transactions_user on public.transactions (user_id);
create index if not exists idx_transactions_wallet on public.transactions (wallet_id);
create index if not exists idx_transactions_booking on public.transactions (booking_id);
create index if not exists idx_transactions_status on public.transactions (status);
create index if not exists idx_transactions_created on public.transactions (created_at desc);

-- ─────────────────────────────────────────
-- TOP-UP REQUESTS
-- ─────────────────────────────────────────
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null,
  phone text not null,
  provider text not null,
  external_reference text,
  internal_reference text not null unique default (gen_random_uuid()::text),
  status text not null default 'pending',
  callback_payload jsonb,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.topup_requests enable row level security;

drop policy if exists "Users see own topup requests" on public.topup_requests;
create policy "Users see own topup requests"
  on public.topup_requests for select to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- WITHDRAWAL REQUESTS
-- ─────────────────────────────────────────
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  amount numeric(12, 2) not null,
  fee numeric(12, 2) not null default 0.00,
  net_amount numeric(12, 2),
  phone text not null,
  provider text not null,
  external_reference text,
  status text not null default 'pending',
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.withdrawal_requests enable row level security;

drop policy if exists "Users see own withdrawals" on public.withdrawal_requests;
create policy "Users see own withdrawals"
  on public.withdrawal_requests for select to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Atomic wallet transfer (SECURITY DEFINER)
-- ─────────────────────────────────────────
create or replace function public.transfer_between_wallets(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_description text,
  p_booking_id uuid default null,
  p_initiated_by text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_wallet public.wallets%rowtype;
  v_to_wallet public.wallets%rowtype;
  v_fee numeric := 0;
  v_transaction_id uuid;
  v_sender_type text := 'booking_payment';
begin
  if p_booking_id is null then
    v_sender_type := 'payment';
  end if;

  select * into v_from_wallet from public.wallets
    where user_id = p_from_user_id
    for update;
  select * into v_to_wallet from public.wallets
    where user_id = p_to_user_id
    for update;

  if v_from_wallet.id is null then
    return jsonb_build_object('success', false, 'error', 'Sender wallet not found');
  end if;
  if v_to_wallet.id is null then
    return jsonb_build_object('success', false, 'error', 'Recipient wallet not found');
  end if;
  if v_from_wallet.is_locked then
    return jsonb_build_object(
      'success', false,
      'error', coalesce('Your wallet is locked: ' || v_from_wallet.locked_reason, 'Your wallet is locked')
    );
  end if;
  if v_from_wallet.balance < p_amount then
    return jsonb_build_object(
      'success', false,
      'error',
      'Insufficient balance. Available: ' || trim(to_char(v_from_wallet.balance, '999999999999.99')) || ' ' || v_from_wallet.currency
    );
  end if;

  update public.wallets set
    balance = balance - p_amount,
    updated_at = now()
  where user_id = p_from_user_id;

  update public.wallets set
    balance = balance + p_amount,
    updated_at = now()
  where user_id = p_to_user_id;

  insert into public.transactions (
    wallet_id, user_id, counterparty_wallet_id, counterparty_user_id,
    type, amount, fee, balance_before, balance_after,
    payment_method, description, booking_id, initiated_by, status, completed_at
  ) values (
    v_from_wallet.id, p_from_user_id, v_to_wallet.id, p_to_user_id,
    v_sender_type, p_amount, v_fee,
    v_from_wallet.balance, v_from_wallet.balance - p_amount,
    'wallet', p_description, p_booking_id, p_initiated_by,
    'completed', now()
  ) returning id into v_transaction_id;

  insert into public.transactions (
    wallet_id, user_id, counterparty_wallet_id, counterparty_user_id,
    type, amount, fee, balance_before, balance_after,
    payment_method, description, booking_id, initiated_by, status, completed_at
  ) values (
    v_to_wallet.id, p_to_user_id, v_from_wallet.id, p_from_user_id,
    'transfer', p_amount, 0,
    v_to_wallet.balance, v_to_wallet.balance + p_amount,
    'wallet', p_description, p_booking_id, p_initiated_by,
    'completed', now()
  );

  return jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount', p_amount,
    'from_balance', v_from_wallet.balance - p_amount,
    'message', 'Transfer completed successfully'
  );
end;
$$;

grant execute on function public.transfer_between_wallets(uuid, uuid, numeric, text, uuid, text) to service_role;
