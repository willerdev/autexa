-- Saved wallet payees (P2P / providers) and optional wallet notes for AI context.

create table if not exists public.wallet_payees (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  payee_user_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete set null,
  label text not null,
  created_at timestamptz not null default now(),
  constraint wallet_payees_no_self check (owner_user_id <> payee_user_id),
  constraint wallet_payees_label_len check (char_length(trim(label)) > 0),
  unique (owner_user_id, payee_user_id)
);

create index if not exists wallet_payees_owner_idx on public.wallet_payees (owner_user_id);

alter table public.wallet_payees enable row level security;

drop policy if exists "wallet_payees_select_own" on public.wallet_payees;
create policy "wallet_payees_select_own"
  on public.wallet_payees for select to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists "wallet_payees_insert_own" on public.wallet_payees;
create policy "wallet_payees_insert_own"
  on public.wallet_payees for insert to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists "wallet_payees_delete_own" on public.wallet_payees;
create policy "wallet_payees_delete_own"
  on public.wallet_payees for delete to authenticated
  using (auth.uid() = owner_user_id);

alter table public.user_ai_context
  add column if not exists wallet_memory text;
