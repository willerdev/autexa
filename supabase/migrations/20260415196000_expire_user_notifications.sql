-- Expiring notifications (do not delete; mark expired so they no longer appear).

alter table public.user_notifications
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists expired_at timestamptz;

create index if not exists user_notifications_expired_idx on public.user_notifications (user_id, expired_at, expires_at);

create or replace function public.expire_user_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.user_notifications
    set expired_at = now()
  where expired_at is null
    and expires_at is not null
    and expires_at < now();

  get diagnostics updated_count = row_count;
  return jsonb_build_object('ok', true, 'expired', updated_count);
end;
$$;

-- Schedule hourly (pg_cron).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'autexa_expire_notifications_hourly') then
    perform cron.schedule(
      'autexa_expire_notifications_hourly',
      '15 * * * *',
      $cron$select public.expire_user_notifications();$cron$
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;

