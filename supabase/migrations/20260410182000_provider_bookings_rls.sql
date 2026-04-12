-- Allow providers to view/update bookings assigned to them.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'bookings_provider_select_own'
  ) then
    execute $pol$
      create policy "bookings_provider_select_own"
        on public.bookings for select
        using (
          exists (
            select 1
            from public.providers p
            where p.id = public.bookings.provider_id
              and p.user_id = auth.uid()
          )
        );
    $pol$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'bookings_provider_update_own'
  ) then
    execute $pol$
      create policy "bookings_provider_update_own"
        on public.bookings for update
        using (
          exists (
            select 1
            from public.providers p
            where p.id = public.bookings.provider_id
              and p.user_id = auth.uid()
          )
        );
    $pol$;
  end if;
end
$$;

