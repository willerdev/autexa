-- Allow unclaimed listing submitter to manage services/products for that listing.
-- This keeps provider-owned flows intact, but also enables editing for `created_by_user_id`
-- when `user_id is null` and `claim_status='unclaimed'`.

create or replace function public.is_provider_owner_or_submitter(p_provider_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = p_provider_id
      and (
        -- claimed provider owner
        (p.user_id = auth.uid())
        -- unclaimed listing submitter
        or (p.user_id is null and p.claim_status = 'unclaimed' and p.created_by_user_id = auth.uid())
      )
  );
$$;

-- provider_services: allow unclaimed submitter to manage
drop policy if exists "provider_services_insert_unclaimed_submitter" on public.provider_services;
create policy "provider_services_insert_unclaimed_submitter"
  on public.provider_services for insert
  to authenticated
  with check (public.is_provider_owner_or_submitter(provider_id));

drop policy if exists "provider_services_update_unclaimed_submitter" on public.provider_services;
create policy "provider_services_update_unclaimed_submitter"
  on public.provider_services for update
  to authenticated
  using (public.is_provider_owner_or_submitter(provider_id));

drop policy if exists "provider_services_delete_unclaimed_submitter" on public.provider_services;
create policy "provider_services_delete_unclaimed_submitter"
  on public.provider_services for delete
  to authenticated
  using (public.is_provider_owner_or_submitter(provider_id));

-- provider_products: allow unclaimed submitter to manage
drop policy if exists "provider_products_insert_unclaimed_submitter" on public.provider_products;
create policy "provider_products_insert_unclaimed_submitter"
  on public.provider_products for insert
  to authenticated
  with check (public.is_provider_owner_or_submitter(provider_id));

drop policy if exists "provider_products_update_unclaimed_submitter" on public.provider_products;
create policy "provider_products_update_unclaimed_submitter"
  on public.provider_products for update
  to authenticated
  using (public.is_provider_owner_or_submitter(provider_id));

drop policy if exists "provider_products_delete_unclaimed_submitter" on public.provider_products;
create policy "provider_products_delete_unclaimed_submitter"
  on public.provider_products for delete
  to authenticated
  using (public.is_provider_owner_or_submitter(provider_id));

