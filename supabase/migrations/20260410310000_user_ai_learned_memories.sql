-- Append-only learned memories for the assistant (Supabase-only retrieval; no vectors).
-- Populated via save_learned_memory tool after user confirmation.

create table if not exists public.user_ai_learned_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint user_ai_learned_memories_body_len check (char_length(body) <= 600)
);

create index if not exists user_ai_learned_memories_user_created_idx
  on public.user_ai_learned_memories (user_id, created_at desc);

alter table public.user_ai_learned_memories enable row level security;

drop policy if exists "user_ai_learned_memories_select_own" on public.user_ai_learned_memories;
create policy "user_ai_learned_memories_select_own"
  on public.user_ai_learned_memories for select
  using (auth.uid() = user_id);

drop policy if exists "user_ai_learned_memories_insert_own" on public.user_ai_learned_memories;
create policy "user_ai_learned_memories_insert_own"
  on public.user_ai_learned_memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_ai_learned_memories_delete_own" on public.user_ai_learned_memories;
create policy "user_ai_learned_memories_delete_own"
  on public.user_ai_learned_memories for delete
  using (auth.uid() = user_id);
