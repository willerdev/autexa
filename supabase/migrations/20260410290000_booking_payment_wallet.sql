-- Allow wallet as a stored booking payment method (AI + app).

alter table public.bookings
  drop constraint if exists bookings_payment_method_chk;

alter table public.bookings
  add constraint bookings_payment_method_chk
  check (payment_method in ('card', 'mobile_money', 'pay_later', 'wallet'));
