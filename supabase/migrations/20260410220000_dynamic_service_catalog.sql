-- Flexible provider services (JSONB metadata, tags, service_type) + type schemas + user prefs + booking line items.

-- ---------------------------------------------------------------------------
-- provider_services: extensible fields
-- ---------------------------------------------------------------------------
alter table public.provider_services
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists service_type text not null default 'general',
  add column if not exists tags text[] not null default array[]::text[];

create index if not exists idx_provider_services_metadata_gin
  on public.provider_services using gin (metadata);

create index if not exists idx_provider_services_service_type
  on public.provider_services (service_type);

-- ---------------------------------------------------------------------------
-- Bookings: link to provider listing + store dynamic payload
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists provider_service_id uuid references public.provider_services (id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists bookings_provider_service_id_idx
  on public.bookings (provider_service_id)
  where provider_service_id is not null;

-- ---------------------------------------------------------------------------
-- service_type_schemas: AI + UI know what to ask / show per type
-- ---------------------------------------------------------------------------
create table if not exists public.service_type_schemas (
  id uuid primary key default gen_random_uuid(),
  service_type text not null unique,
  display_name text not null,
  description text,
  metadata_schema jsonb not null default '{}'::jsonb,
  booking_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists service_type_schemas_service_type_idx
  on public.service_type_schemas (service_type);

alter table public.service_type_schemas enable row level security;

drop policy if exists "service_type_schemas_select_authenticated" on public.service_type_schemas;
create policy "service_type_schemas_select_authenticated"
  on public.service_type_schemas for select
  to authenticated
  using (true);

insert into public.service_type_schemas (service_type, display_name, description, metadata_schema, booking_fields)
values
(
  'automotive',
  'Automotive Service',
  'Car repairs, maintenance, detailing',
  '{"fields":[{"key":"labour_hours","label":"Labour Hours","type":"number"},{"key":"parts_included","label":"Parts Included","type":"boolean"},{"key":"warranty_days","label":"Warranty (days)","type":"number"}]}'::jsonb,
  '{"required":["car_id","date","time"],"optional":["notes"]}'::jsonb
),
(
  'food',
  'Food & Delivery',
  'Restaurants, meal delivery, catering',
  '{"fields":[{"key":"menu","label":"Menu Items","type":"array","item_schema":{"name":"string","description":"string","price":"number","category":"string","available":"boolean","dietary_tags":"array"}},{"key":"cuisine_type","label":"Cuisine Type","type":"string"},{"key":"delivery_radius_km","label":"Delivery Radius (km)","type":"number"},{"key":"min_order","label":"Minimum Order","type":"number"},{"key":"prep_time_minutes","label":"Prep Time (minutes)","type":"number"}]}'::jsonb,
  '{"required":["delivery_address","selected_items","date","time"],"optional":["special_instructions","dietary_requirements"]}'::jsonb
),
(
  'cleaning',
  'Cleaning Service',
  'Home, office, car interior cleaning',
  '{"fields":[{"key":"cleaning_types","label":"Cleaning Types","type":"array"},{"key":"hourly_rate","label":"Hourly Rate","type":"number"},{"key":"supplies_included","label":"Supplies Included","type":"boolean"}]}'::jsonb,
  '{"required":["address","room_count","date","time"],"optional":["special_instructions","pet_info"]}'::jsonb
),
(
  'general',
  'General Service',
  'Any other service type',
  '{"fields":[]}'::jsonb,
  '{"required":["date","time"],"optional":["notes"]}'::jsonb
)
on conflict (service_type) do nothing;

-- ---------------------------------------------------------------------------
-- user_service_preferences (FK to public.users — same id as auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.user_service_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  service_type text not null,
  provider_id uuid references public.providers (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  last_interaction timestamptz not null default now(),
  interaction_count integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists user_service_preferences_user_type_idx
  on public.user_service_preferences (user_id, service_type);

create index if not exists user_service_preferences_updated_idx
  on public.user_service_preferences (user_id, service_type, updated_at desc);

-- One row per (user, type) when provider_id is null; one per (user, type, provider) when set
create unique index if not exists user_service_preferences_global_uniq
  on public.user_service_preferences (user_id, service_type)
  where provider_id is null;

create unique index if not exists user_service_preferences_provider_uniq
  on public.user_service_preferences (user_id, service_type, provider_id)
  where provider_id is not null;

alter table public.user_service_preferences enable row level security;

drop policy if exists "user_service_preferences_all_own" on public.user_service_preferences;
create policy "user_service_preferences_all_own"
  on public.user_service_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- booking_items (multi-item orders)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  item_name text not null,
  item_metadata jsonb not null default '{}'::jsonb,
  unit_price numeric(12, 2),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists booking_items_booking_id_idx on public.booking_items (booking_id);

alter table public.booking_items enable row level security;

drop policy if exists "booking_items_select_own" on public.booking_items;
create policy "booking_items_select_own"
  on public.booking_items for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_items.booking_id
        and b.user_id = auth.uid()
    )
  );

drop policy if exists "booking_items_insert_own" on public.booking_items;
create policy "booking_items_insert_own"
  on public.booking_items for insert
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_items.booking_id
        and b.user_id = auth.uid()
    )
  );
