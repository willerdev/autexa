-- Track booking cancellations initiated by the user/assistant.

alter table public.bookings
  add column if not exists cancel_reason text;

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

