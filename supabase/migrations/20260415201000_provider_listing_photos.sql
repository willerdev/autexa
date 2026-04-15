-- Provider listing photos (for unclaimed/claimed business profiles)

alter table public.providers
  add column if not exists image_url text,
  add column if not exists gallery_urls text[] not null default '{}';

