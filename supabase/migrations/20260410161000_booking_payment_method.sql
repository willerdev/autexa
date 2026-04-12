-- Track payment method choice for a booking.

alter table public.bookings
  add column if not exists payment_method text not null default 'card';

alter table public.bookings
  drop constraint if exists bookings_payment_method_chk;

alter table public.bookings
  add constraint bookings_payment_method_chk
  check (payment_method in ('card', 'mobile_money', 'pay_later'));

