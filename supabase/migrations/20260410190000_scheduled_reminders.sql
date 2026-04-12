-- Low-maintenance reminders: run inside Supabase on a schedule (pg_cron).
-- Creates in-app notifications for upcoming bookings and avoids duplicates.

create extension if not exists pg_cron;

create table if not exists public.notification_jobs_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  job_type text not null,
  ref_id uuid,
  sent_at timestamptz not null default now(),
  unique (job_type, ref_id, user_id)
);

create index if not exists notification_jobs_sent_user_idx on public.notification_jobs_sent (user_id);

alter table public.notification_jobs_sent enable row level security;

-- No client read/write (internal use).
drop policy if exists "notification_jobs_sent_no_client_select" on public.notification_jobs_sent;
create policy "notification_jobs_sent_no_client_select"
  on public.notification_jobs_sent for select
  using (false);

drop policy if exists "notification_jobs_sent_no_client_write" on public.notification_jobs_sent;
create policy "notification_jobs_sent_no_client_write"
  on public.notification_jobs_sent for insert
  with check (false);

create or replace function public.run_autexa_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  /*
    Booking reminders:
    - Send a reminder for bookings happening tomorrow (by date)
    - Only for statuses that are not cancelled/completed
    - Only once per booking per user (deduped via notification_jobs_sent)
  */

  with due as (
    select b.id as booking_id, b.user_id, b.date, b.time, b.service_name
    from public.bookings b
    where b.date = (current_date + 1)
      and coalesce(lower(b.status), '') not in ('cancelled', 'completed')
  ),
  newly_sent as (
    insert into public.notification_jobs_sent (user_id, job_type, ref_id)
    select d.user_id, 'booking_reminder_tomorrow', d.booking_id
    from due d
    on conflict do nothing
    returning user_id, ref_id
  )
  insert into public.user_notifications (user_id, title, body, data)
  select
    d.user_id,
    'Upcoming booking',
    coalesce(d.service_name, 'Service') || ' tomorrow at ' || d.time,
    jsonb_build_object('booking_id', d.booking_id, 'date', d.date::text, 'time', d.time, 'service_name', d.service_name)
  from due d
  join newly_sent s on s.user_id = d.user_id and s.ref_id = d.booking_id;

  get diagnostics inserted_count = row_count;

  return jsonb_build_object('ok', true, 'inserted', inserted_count);
end;
$$;

-- Schedule daily at 08:00 server time (adjust as needed).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'autexa_reminders_daily') then
    perform cron.schedule('autexa_reminders_daily', '0 8 * * *', $$select public.run_autexa_reminders();$$);
  end if;
exception
  when undefined_table then
    -- cron.job may not be visible in some setups; still allow manual function execution.
    null;
end
$$;

