-- Support multiple images per product/service.

alter table public.provider_products
  add column if not exists gallery_urls text[] not null default '{}';

alter table public.provider_services
  add column if not exists gallery_urls text[] not null default '{}';

