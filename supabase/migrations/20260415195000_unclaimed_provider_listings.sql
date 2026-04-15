-- Allow providers/users to submit unclaimed business listings (public marketplace data).
-- Ownership is null; record who submitted for auditing/editing.

alter table public.providers
  add column if not exists created_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists claim_status text not null default 'unclaimed';

create index if not exists providers_created_by_user_idx on public.providers (created_by_user_id);
create index if not exists providers_claim_status_idx on public.providers (claim_status);

-- Allow authenticated users to insert unclaimed providers they submit.
drop policy if exists "providers_insert_unclaimed" on public.providers;
create policy "providers_insert_unclaimed"
  on public.providers for insert
  to authenticated
  with check (
    user_id is null
    and claim_status = 'unclaimed'
    and created_by_user_id = auth.uid()
  );

-- Allow submitter to edit their unclaimed listing until claimed.
drop policy if exists "providers_update_unclaimed_by_submitter" on public.providers;
create policy "providers_update_unclaimed_by_submitter"
  on public.providers for update
  to authenticated
  using (
    user_id is null
    and claim_status = 'unclaimed'
    and created_by_user_id = auth.uid()
  );

