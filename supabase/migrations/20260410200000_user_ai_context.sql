-- Persistent AI user context (preferences + notes).

create table if not exists public.user_ai_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preferred_payment text,
  preferred_location text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.user_ai_context enable row level security;

drop policy if exists "user_ai_context_select_own" on public.user_ai_context;
create policy "user_ai_context_select_own"
  on public.user_ai_context for select
  using (auth.uid() = user_id);

drop policy if exists "user_ai_context_insert_own" on public.user_ai_context;
create policy "user_ai_context_insert_own"
  on public.user_ai_context for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_ai_context_update_own" on public.user_ai_context;
create policy "user_ai_context_update_own"
  on public.user_ai_context for update
  using (auth.uid() = user_id);

create or replace function public.set_updated_at_user_ai_context()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_ai_context_set_updated_at on public.user_ai_context;
create trigger user_ai_context_set_updated_at
before update on public.user_ai_context
for each row execute function public.set_updated_at_user_ai_context();

