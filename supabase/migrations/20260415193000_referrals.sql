-- Referrals: user referral codes + referral tracking + wallet bonus eligibility.
-- Reward logic is handled by the server API (service role), not by client inserts.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_code_idx on public.referral_codes (code);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referred_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  metadata jsonb not null default '{}',
  constraint referrals_unique_referred unique (referred_user_id),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, created_at desc);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

-- Users can read their own code.
drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
  on public.referral_codes for select
  to authenticated
  using (auth.uid() = user_id);

-- Client inserts are not allowed; server uses service_role.
drop policy if exists "referral_codes_no_client_insert" on public.referral_codes;
create policy "referral_codes_no_client_insert"
  on public.referral_codes for insert
  with check (false);

-- Users can see referrals where they are involved.
drop policy if exists "referrals_select_participant" on public.referrals;
create policy "referrals_select_participant"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- Client inserts/updates are not allowed; server uses service_role.
drop policy if exists "referrals_no_client_write" on public.referrals;
create policy "referrals_no_client_write"
  on public.referrals for insert
  with check (false);

drop policy if exists "referrals_no_client_update" on public.referrals;
create policy "referrals_no_client_update"
  on public.referrals for update
  using (false);

