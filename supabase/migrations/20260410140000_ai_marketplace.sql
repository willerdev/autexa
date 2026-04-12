-- AI marketplace: roles, pricing signal, payments, push tokens, booking automation fields.

do $$ begin
  create type public.app_role as enum ('user', 'provider', 'admin');
exception
  when duplicate_object then null;
end $$;

alter table public.users
  add column if not exists role public.app_role not null default 'user';

alter table public.providers
  add column if not exists base_price_cents integer not null default 4999;

alter table public.bookings
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists amount_cents integer,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists auto_assigned boolean not null default false;

alter table public.bookings
  drop constraint if exists bookings_payment_status_chk;
alter table public.bookings
  add constraint bookings_payment_status_chk
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  provider text not null default 'stripe',
  provider_ref text,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'pending',
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_transactions_user_idx on public.payment_transactions (user_id);
create index if not exists payment_transactions_booking_idx on public.payment_transactions (booking_id);

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists user_push_tokens_user_idx on public.user_push_tokens (user_id);

-- Provider inbox for automation / future push to provider apps
create table if not exists public.provider_notifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists provider_notifications_provider_idx on public.provider_notifications (provider_id);

alter table public.payment_transactions enable row level security;
alter table public.user_push_tokens enable row level security;
alter table public.provider_notifications enable row level security;

create policy "payment_transactions_select_own"
  on public.payment_transactions for select
  using (auth.uid() = user_id);

create policy "user_push_tokens_select_own"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

create policy "user_push_tokens_upsert_own"
  on public.user_push_tokens for insert
  with check (auth.uid() = user_id);

create policy "user_push_tokens_update_own"
  on public.user_push_tokens for update
  using (auth.uid() = user_id);

create policy "user_push_tokens_delete_own"
  on public.user_push_tokens for delete
  using (auth.uid() = user_id);

-- Providers read their notifications (requires matching auth user to provider — MVP: service role writes only)
create policy "provider_notifications_no_client_read"
  on public.provider_notifications for select
  using (false);
