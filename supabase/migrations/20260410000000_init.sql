-- Autexa schema: run once in Supabase SQL Editor or via Supabase CLI.

-- Profiles linked 1:1 with auth.users
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text,
  phone text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text not null,
  rating numeric(3, 2) not null default 4.5,
  location text not null default '',
  is_available boolean not null default true
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  slug text unique
);

do $$ begin
  create type public.request_status as enum ('pending', 'accepted', 'completed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  service_id uuid not null references public.services (id),
  description text not null default '',
  location text not null default '',
  status public.request_status not null default 'pending',
  urgency text not null default 'normal',
  assigned_provider_id uuid references public.providers (id),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id),
  date date not null,
  time text not null,
  status text not null default 'pending',
  service_name text
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users (id) on delete cascade,
  receiver_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists service_requests_user_id_idx on public.service_requests (user_id);
create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists messages_pair_idx on public.messages (sender_id, receiver_id, created_at);

-- New user -> public.users row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(nullif(excluded.name, ''), public.users.name),
        phone = coalesce(nullif(excluded.phone, ''), public.users.phone);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.users enable row level security;
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.messages enable row level security;

create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

create policy "providers_read_auth" on public.providers for select to authenticated using (true);

create policy "services_read_auth" on public.services for select to authenticated using (true);

create policy "service_requests_select_own" on public.service_requests for select using (auth.uid() = user_id);
create policy "service_requests_insert_own" on public.service_requests for insert with check (auth.uid() = user_id);
create policy "service_requests_update_own" on public.service_requests for update using (auth.uid() = user_id);

create policy "bookings_select_own" on public.bookings for select using (auth.uid() = user_id);
create policy "bookings_insert_own" on public.bookings for insert with check (auth.uid() = user_id);

create policy "messages_select_participant" on public.messages for select using (
  auth.uid() = sender_id or auth.uid() = receiver_id
);
create policy "messages_insert_as_sender" on public.messages for insert with check (auth.uid() = sender_id);

-- Realtime: add messages (skip if already in publication)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Seed services (slugs match app quick actions)
insert into public.services (name, category, slug)
values
  ('Car Wash', 'auto', 'wash'),
  ('Mechanic', 'auto', 'mechanic'),
  ('Tow Truck', 'auto', 'tow'),
  ('Detailing', 'auto', 'detail'),
  ('Tire Service', 'auto', 'tire'),
  ('Battery Jump', 'auto', 'battery'),
  ('Inspection', 'auto', 'inspection')
on conflict (slug) do nothing;

insert into public.providers (name, service_type, rating, location, is_available)
select name, service_type, rating, location, is_available
from (
  values
    ('Sparkle Auto Wash'::text, 'Car Wash'::text, 4.9::numeric, '1.2 km · Downtown'::text, true),
    ('Torque Masters Garage', 'Mechanic', 4.8, '2.4 km · North', true),
    ('RoadRescue Towing', 'Tow Truck', 4.7, '3.1 km · East', true),
    ('Elite Detailing Co.', 'Detailing', 4.9, '4.5 km · West', true),
    ('QuickFix Mobile', 'On-site repair', 4.6, '5.2 km · Mobile', true)
) as v(name, service_type, rating, location, is_available)
where not exists (select 1 from public.providers p where p.name = v.name);
