-- Business detail + Map support:
-- - provider flag: is_product_business
-- - map coordinates: lat/lng
-- - public contact fields for detail page: phone, working_days
-- - optional product catalog: provider_products

alter table public.providers
  add column if not exists is_product_business boolean not null default false,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists phone text not null default '',
  add column if not exists working_days text not null default '';

create index if not exists providers_lat_lng_idx on public.providers (lat, lng);
create index if not exists providers_is_product_business_idx on public.providers (is_product_business);

-- Optional: basic product catalog for product-based businesses.
create table if not exists public.provider_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  title text not null,
  description text not null default '',
  price_cents integer not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_products_provider_idx on public.provider_products (provider_id);

alter table public.provider_products enable row level security;

-- Anyone authenticated can read active products (customer browsing).
drop policy if exists "provider_products_select_auth_active" on public.provider_products;
create policy "provider_products_select_auth_active"
  on public.provider_products for select
  to authenticated
  using (is_active = true);

-- Provider owner can manage products (reuse is_provider_owner from provider_dashboard migration).
drop policy if exists "provider_products_insert_own" on public.provider_products;
create policy "provider_products_insert_own"
  on public.provider_products for insert
  with check (public.is_provider_owner(provider_id));

drop policy if exists "provider_products_update_own" on public.provider_products;
create policy "provider_products_update_own"
  on public.provider_products for update
  using (public.is_provider_owner(provider_id));

drop policy if exists "provider_products_delete_own" on public.provider_products;
create policy "provider_products_delete_own"
  on public.provider_products for delete
  using (public.is_provider_owner(provider_id));

-- updated_at trigger
drop trigger if exists provider_products_set_updated_at on public.provider_products;
create trigger provider_products_set_updated_at
before update on public.provider_products
for each row execute function public.set_updated_at();

