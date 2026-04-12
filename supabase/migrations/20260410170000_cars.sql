-- User cars garage

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  make text not null default '',
  model text not null default '',
  year text not null default '',
  plate text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cars_user_id_idx on public.cars (user_id);

alter table public.cars enable row level security;

create policy "cars_select_own" on public.cars for select using (auth.uid() = user_id);
create policy "cars_insert_own" on public.cars for insert with check (auth.uid() = user_id);
create policy "cars_update_own" on public.cars for update using (auth.uid() = user_id);
create policy "cars_delete_own" on public.cars for delete using (auth.uid() = user_id);

drop trigger if exists cars_set_updated_at on public.cars;
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cars_set_updated_at
before update on public.cars
for each row execute function public.set_updated_at();

