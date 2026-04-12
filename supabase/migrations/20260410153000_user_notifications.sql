-- User notifications for in-app automation feedback (created by server/service role).

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

create policy "user_notifications_select_own"
  on public.user_notifications for select
  using (auth.uid() = user_id);

-- Client inserts are not allowed; server uses service_role.
create policy "user_notifications_no_client_insert"
  on public.user_notifications for insert
  with check (false);

