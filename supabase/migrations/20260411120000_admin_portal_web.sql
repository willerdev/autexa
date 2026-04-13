-- Admin portal / web: user bans, feature flags, showcase categories (service role + admin API only).

alter table public.users
  add column if not exists banned_at timestamptz;

comment on column public.users.banned_at is 'When set, API rejects the user (403). Managed via admin portal.';

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.admin_settings is 'Key-value config for admin-controlled API behaviour. RLS: no client access.';

create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists marketplace_categories_slug_uniq
  on public.marketplace_categories (slug)
  where slug is not null and length(trim(slug)) > 0;

comment on table public.marketplace_categories is 'Curated categories for marketing/admin; app can adopt later.';

alter table public.admin_settings enable row level security;
alter table public.marketplace_categories enable row level security;

create policy "admin_settings_no_client"
  on public.admin_settings for all
  using (false)
  with check (false);

create policy "marketplace_categories_no_client"
  on public.marketplace_categories for all
  using (false)
  with check (false);

insert into public.admin_settings (key, value)
values (
  'api_flags',
  jsonb_build_object(
    'twilio_sms', true,
    'ai_chat', true,
    'pitstop_assist', true
  )
)
on conflict (key) do nothing;
