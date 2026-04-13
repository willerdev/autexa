-- Savings challenges: invite friends, compete to reach a target fastest, leaderboard + reward.

do $$ begin
  create type public.challenge_status as enum ('draft', 'active', 'ended');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.challenge_member_status as enum ('invited', 'accepted', 'declined');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.savings_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Savings challenge',
  target_amount numeric(12, 2) not null,
  starting_amount numeric(12, 2) not null default 0.00,
  currency text not null default 'UGX',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status public.challenge_status not null default 'active',
  winner_user_id uuid references auth.users (id) on delete set null,
  total_contributed numeric(12, 2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_challenges_creator on public.savings_challenges (creator_user_id, created_at desc);
create index if not exists idx_savings_challenges_status_ends on public.savings_challenges (status, ends_at);

create table if not exists public.savings_challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.savings_challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  status public.challenge_member_status not null default 'invited',
  invited_by_user_id uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index if not exists idx_savings_challenge_members_user on public.savings_challenge_members (user_id, created_at desc);
create index if not exists idx_savings_challenge_members_challenge on public.savings_challenge_members (challenge_id, status);

create table if not exists public.savings_challenge_contributions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.savings_challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null,
  source text not null default 'wallet', -- wallet | savings
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_challenge_contrib_challenge on public.savings_challenge_contributions (challenge_id, created_at desc);
create index if not exists idx_savings_challenge_contrib_user on public.savings_challenge_contributions (user_id, created_at desc);

alter table public.savings_challenges enable row level security;
alter table public.savings_challenge_members enable row level security;
alter table public.savings_challenge_contributions enable row level security;

-- Helper: is member (any status) of challenge
create or replace function public.is_savings_challenge_member(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.savings_challenge_members m
    where m.challenge_id = p_challenge_id and m.user_id = p_user_id
  );
$$;

-- Helper: is accepted member
create or replace function public.is_savings_challenge_accepted(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.savings_challenge_members m
    where m.challenge_id = p_challenge_id
      and m.user_id = p_user_id
      and m.status = 'accepted'
  );
$$;

-- Read policies: members can read challenge + members + contributions
drop policy if exists "savings_challenges_read_members" on public.savings_challenges;
create policy "savings_challenges_read_members"
  on public.savings_challenges for select to authenticated
  using (public.is_savings_challenge_member(id, auth.uid()));

drop policy if exists "savings_challenge_members_read_members" on public.savings_challenge_members;
create policy "savings_challenge_members_read_members"
  on public.savings_challenge_members for select to authenticated
  using (public.is_savings_challenge_member(challenge_id, auth.uid()));

drop policy if exists "savings_challenge_contrib_read_members" on public.savings_challenge_contributions;
create policy "savings_challenge_contrib_read_members"
  on public.savings_challenge_contributions for select to authenticated
  using (public.is_savings_challenge_member(challenge_id, auth.uid()));

-- Writes: only service_role (API) should mutate these tables.
revoke all on table public.savings_challenges from authenticated, anon;
revoke all on table public.savings_challenge_members from authenticated, anon;
revoke all on table public.savings_challenge_contributions from authenticated, anon;
grant select on table public.savings_challenges to authenticated;
grant select on table public.savings_challenge_members to authenticated;
grant select on table public.savings_challenge_contributions to authenticated;

