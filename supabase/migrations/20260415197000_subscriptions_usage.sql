-- Subscriptions + usage counters (enforced by server; clients can read their own status).

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free', -- free | professional
  status text not null default 'active', -- active | pending | past_due | canceled
  current_period_start timestamptz,
  current_period_end timestamptz,
  flutterwave_tx_ref text,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_plan_idx on public.user_subscriptions (plan, status);

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_yyyymm text not null,
  ai_requests_count integer not null default 0,
  sms_sends_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_yyyymm)
);

create index if not exists usage_counters_user_period_idx on public.usage_counters (user_id, period_yyyymm);

alter table public.user_subscriptions enable row level security;
alter table public.usage_counters enable row level security;

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own"
  on public.user_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "usage_counters_select_own" on public.usage_counters;
create policy "usage_counters_select_own"
  on public.usage_counters for select
  to authenticated
  using (auth.uid() = user_id);

-- No client writes; server uses service_role.
drop policy if exists "user_subscriptions_no_client_write" on public.user_subscriptions;
create policy "user_subscriptions_no_client_write"
  on public.user_subscriptions for all
  using (false)
  with check (false);

drop policy if exists "usage_counters_no_client_write" on public.usage_counters;
create policy "usage_counters_no_client_write"
  on public.usage_counters for all
  using (false)
  with check (false);

