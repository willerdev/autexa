-- Track provider service views by users.

alter table public.provider_services
  add column if not exists views_count integer not null default 0;

create table if not exists public.provider_service_views (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.provider_services (id) on delete cascade,
  viewer_user_id uuid not null references public.users (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists provider_service_views_service_idx on public.provider_service_views (service_id);
create index if not exists provider_service_views_viewer_idx on public.provider_service_views (viewer_user_id);

alter table public.provider_service_views enable row level security;

-- Anyone authenticated can log their own view.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_service_views'
      and policyname = 'provider_service_views_insert_own'
  ) then
    execute $pol$
      create policy "provider_service_views_insert_own"
        on public.provider_service_views for insert
        with check (auth.uid() = viewer_user_id);
    $pol$;
  end if;
end
$$;

-- Provider can read view rows for their own services (analytics).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_service_views'
      and policyname = 'provider_service_views_select_provider'
  ) then
    execute $pol$
      create policy "provider_service_views_select_provider"
        on public.provider_service_views for select
        using (
          exists (
            select 1
            from public.provider_services s
            join public.providers p on p.id = s.provider_id
            where s.id = public.provider_service_views.service_id
              and p.user_id = auth.uid()
          )
        );
    $pol$;
  end if;
end
$$;

create or replace function public.bump_provider_service_views()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.provider_services
    set views_count = coalesce(views_count, 0) + 1
    where id = new.service_id;
  return new;
end;
$$;

drop trigger if exists provider_service_views_bump on public.provider_service_views;
create trigger provider_service_views_bump
after insert on public.provider_service_views
for each row execute function public.bump_provider_service_views();

