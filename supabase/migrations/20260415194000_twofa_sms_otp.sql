-- SMS OTP 2FA (application-level gate; enforced by API for protected endpoints).

alter table public.users
  add column if not exists twofa_enabled boolean not null default false,
  add column if not exists twofa_phone text not null default '';

comment on column public.users.twofa_enabled is 'When true, app/API should require OTP verification for sensitive actions / login gate.';
comment on column public.users.twofa_phone is 'Phone number used for OTP delivery (E.164 or local).';

create table if not exists public.twofa_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  purpose text not null default 'login', -- login | enable | disable
  code_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  request_ip text,
  created_at timestamptz not null default now()
);

create index if not exists twofa_otps_user_idx on public.twofa_otps (user_id, created_at desc);
create index if not exists twofa_otps_expires_idx on public.twofa_otps (expires_at);

alter table public.twofa_otps enable row level security;

-- No client access; server uses service_role.
drop policy if exists "twofa_otps_no_client" on public.twofa_otps;
create policy "twofa_otps_no_client"
  on public.twofa_otps for all
  using (false)
  with check (false);

