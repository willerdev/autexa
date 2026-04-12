-- Per-car service history (completed work), for AI tools and UI.

create table if not exists public.car_service_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  car_id uuid not null references public.cars (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  service_name text,
  provider_name text,
  cost numeric(12, 2),
  notes text,
  serviced_at timestamptz not null default now()
);

create index if not exists car_service_history_user_idx on public.car_service_history (user_id);
create index if not exists car_service_history_car_idx on public.car_service_history (car_id);
create index if not exists car_service_history_serviced_at_idx on public.car_service_history (serviced_at desc);

alter table public.car_service_history enable row level security;

drop policy if exists "car_service_history_select_own" on public.car_service_history;
create policy "car_service_history_select_own"
  on public.car_service_history for select
  using (auth.uid() = user_id);

drop policy if exists "car_service_history_insert_own" on public.car_service_history;
create policy "car_service_history_insert_own"
  on public.car_service_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "car_service_history_update_own" on public.car_service_history;
create policy "car_service_history_update_own"
  on public.car_service_history for update
  using (auth.uid() = user_id);

drop policy if exists "car_service_history_delete_own" on public.car_service_history;
create policy "car_service_history_delete_own"
  on public.car_service_history for delete
  using (auth.uid() = user_id);
