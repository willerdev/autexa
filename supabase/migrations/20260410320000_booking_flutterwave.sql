-- Flutterwave standard checkout tx_ref for booking payments (Stripe session retired in app flow).

alter table public.bookings
  add column if not exists flutterwave_tx_ref text;

create index if not exists bookings_flutterwave_tx_ref_idx
  on public.bookings (flutterwave_tx_ref)
  where flutterwave_tx_ref is not null;
