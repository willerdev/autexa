-- Service detail: public listing reads, gallery URLs, reviews, provider replies, storage bucket.

-- ---------------------------------------------------------------------------
-- Listings: extra images + public read for active services (authenticated app users)
-- ---------------------------------------------------------------------------
alter table public.provider_services
  add column if not exists gallery_urls text[] not null default array[]::text[];

drop policy if exists "provider_services_select_public_active" on public.provider_services;
create policy "provider_services_select_public_active"
  on public.provider_services for select
  to authenticated
  using (is_active = true);

-- ---------------------------------------------------------------------------
-- Reviews (one review per user per listing)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_service_reviews (
  id uuid primary key default gen_random_uuid(),
  provider_service_id uuid not null references public.provider_services (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  body text not null default '',
  provider_reply text,
  provider_replied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider_service_id, user_id)
);

create index if not exists provider_service_reviews_service_idx
  on public.provider_service_reviews (provider_service_id, created_at desc);

alter table public.provider_service_reviews enable row level security;

drop policy if exists "provider_service_reviews_select_auth" on public.provider_service_reviews;
create policy "provider_service_reviews_select_auth"
  on public.provider_service_reviews for select
  to authenticated
  using (true);

drop policy if exists "provider_service_reviews_insert_own" on public.provider_service_reviews;
create policy "provider_service_reviews_insert_own"
  on public.provider_service_reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Provider-only reply via RPC (below); no direct row updates from clients for reply.

-- ---------------------------------------------------------------------------
-- RPC: owner of the listing sets reply text
-- ---------------------------------------------------------------------------
create or replace function public.submit_provider_review_reply(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service uuid;
  v_owner uuid;
begin
  if p_reply is null or length(trim(p_reply)) = 0 then
    raise exception 'Reply cannot be empty';
  end if;

  select r.provider_service_id into v_service
  from public.provider_service_reviews r
  where r.id = p_review_id;

  if v_service is null then
    raise exception 'Review not found';
  end if;

  select p.user_id into v_owner
  from public.provider_services s
  join public.providers p on p.id = s.provider_id
  where s.id = v_service;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  update public.provider_service_reviews
  set
    provider_reply = trim(p_reply),
    provider_replied_at = now()
  where id = p_review_id;
end;
$$;

grant execute on function public.submit_provider_review_reply(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public service images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do update set public = true;

drop policy if exists "service_images_public_read" on storage.objects;
create policy "service_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'service-images');

drop policy if exists "service_images_provider_upload" on storage.objects;
create policy "service_images_provider_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.providers p
      where p.user_id = auth.uid()
        and p.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "service_images_provider_delete" on storage.objects;
create policy "service_images_provider_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.providers p
      where p.user_id = auth.uid()
        and p.id::text = (storage.foldername(name))[1]
    )
  );
