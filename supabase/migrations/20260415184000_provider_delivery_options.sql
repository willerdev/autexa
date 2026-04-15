-- Provider delivery / pickup options + delivery list.

alter table public.providers
  add column if not exists delivery_mode text not null default 'pickup' check (delivery_mode in ('pickup','delivery','both')),
  add column if not exists delivery_area text not null default '';

create table if not exists public.provider_delivery_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  product_id uuid not null references public.provider_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider_id, product_id)
);

create index if not exists provider_delivery_items_provider_idx on public.provider_delivery_items (provider_id);

alter table public.provider_delivery_items enable row level security;

-- Anyone authenticated can read delivery list (customer browsing).
drop policy if exists "provider_delivery_items_select_auth" on public.provider_delivery_items;
create policy "provider_delivery_items_select_auth"
  on public.provider_delivery_items for select
  to authenticated
  using (true);

-- Only provider owner or unclaimed submitter can manage.
drop policy if exists "provider_delivery_items_insert_manage" on public.provider_delivery_items;
create policy "provider_delivery_items_insert_manage"
  on public.provider_delivery_items for insert
  to authenticated
  with check (public.is_provider_owner_or_submitter(provider_id));

drop policy if exists "provider_delivery_items_delete_manage" on public.provider_delivery_items;
create policy "provider_delivery_items_delete_manage"
  on public.provider_delivery_items for delete
  to authenticated
  using (public.is_provider_owner_or_submitter(provider_id));

