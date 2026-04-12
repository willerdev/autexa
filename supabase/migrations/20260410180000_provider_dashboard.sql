-- Provider dashboard: link provider profile to auth user + allow providers to post services.

alter table public.providers
  add column if not exists user_id uuid references public.users (id) on delete set null;

create unique index if not exists providers_user_id_uniq on public.providers (user_id) where user_id is not null;

-- Provider-defined categories (for their own postings; separate from the global `services` table).
create table if not exists public.provider_categories (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (provider_id, name)
);

create index if not exists provider_categories_provider_idx on public.provider_categories (provider_id);

-- Provider service postings/offers.
create table if not exists public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  category_id uuid references public.provider_categories (id) on delete set null,
  title text not null,
  description text not null default '',
  price_cents integer not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_services_provider_idx on public.provider_services (provider_id);
create index if not exists provider_services_category_idx on public.provider_services (category_id);

alter table public.provider_categories enable row level security;
alter table public.provider_services enable row level security;

-- Helper: provider owns row if their auth user maps to the provider_id.
create or replace function public.is_provider_owner(p_provider_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = p_provider_id
      and p.user_id = auth.uid()
  );
$$;

create policy "provider_categories_select_own"
  on public.provider_categories for select
  using (public.is_provider_owner(provider_id));

create policy "provider_categories_insert_own"
  on public.provider_categories for insert
  with check (public.is_provider_owner(provider_id));

create policy "provider_categories_update_own"
  on public.provider_categories for update
  using (public.is_provider_owner(provider_id));

create policy "provider_categories_delete_own"
  on public.provider_categories for delete
  using (public.is_provider_owner(provider_id));

create policy "provider_services_select_own"
  on public.provider_services for select
  using (public.is_provider_owner(provider_id));

create policy "provider_services_insert_own"
  on public.provider_services for insert
  with check (public.is_provider_owner(provider_id));

create policy "provider_services_update_own"
  on public.provider_services for update
  using (public.is_provider_owner(provider_id));

create policy "provider_services_delete_own"
  on public.provider_services for delete
  using (public.is_provider_owner(provider_id));

-- updated_at triggers (reuse helper if present)
drop trigger if exists provider_services_set_updated_at on public.provider_services;
create trigger provider_services_set_updated_at
before update on public.provider_services
for each row execute function public.set_updated_at();

