-- Make provider dashboard features admin-only (RLS guard).
-- UI already hides these for non-admin, but this is the real security layer.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.role, 'user') = 'admin'
  );
$$;

-- Provider categories/services: admin-only management.
drop policy if exists "provider_categories_select_own" on public.provider_categories;
drop policy if exists "provider_categories_insert_own" on public.provider_categories;
drop policy if exists "provider_categories_update_own" on public.provider_categories;
drop policy if exists "provider_categories_delete_own" on public.provider_categories;

create policy "provider_categories_admin_only"
  on public.provider_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "provider_services_select_own" on public.provider_services;
drop policy if exists "provider_services_insert_own" on public.provider_services;
drop policy if exists "provider_services_update_own" on public.provider_services;
drop policy if exists "provider_services_delete_own" on public.provider_services;

create policy "provider_services_admin_only"
  on public.provider_services for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Provider bookings management (bookings table): admin-only provider-side access.
drop policy if exists "bookings_provider_select_own" on public.bookings;
drop policy if exists "bookings_provider_update_own" on public.bookings;

create policy "bookings_provider_admin_only_select"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

create policy "bookings_provider_admin_only_update"
  on public.bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

