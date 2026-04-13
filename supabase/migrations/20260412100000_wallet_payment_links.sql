-- Payment links: guests top up the link owner's wallet via Flutterwave (public API + server).

create table if not exists public.wallet_payment_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique,
  title text,
  suggested_amount_ugx numeric(12, 2),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_payment_links_owner on public.wallet_payment_links (owner_user_id);
create index if not exists idx_wallet_payment_links_active_slug on public.wallet_payment_links (slug) where active = true;

alter table public.wallet_payment_links enable row level security;

drop policy if exists "Owners manage payment links" on public.wallet_payment_links;
create policy "Owners manage payment links"
  on public.wallet_payment_links for all to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

alter table public.topup_requests
  add column if not exists payment_link_id uuid references public.wallet_payment_links (id) on delete set null;

create index if not exists idx_topup_requests_payment_link on public.topup_requests (payment_link_id)
  where payment_link_id is not null;
