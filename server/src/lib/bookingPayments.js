/** Normalize AI / user phrasing to DB `bookings.payment_method`. */

export function normalizeBookingPaymentMethod(raw) {
  const p = String(raw ?? 'card')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (p === 'cash' || p === 'pay_on_arrival' || p === 'in_person' || p === 'later') return 'pay_later';
  if (p === 'stripe' || p === 'credit' || p === 'debit' || p === 'visa' || p === 'mastercard') return 'card';
  const allowed = ['card', 'mobile_money', 'pay_later', 'wallet'];
  if (allowed.includes(p)) return p;
  return 'card';
}

export function paymentMethodLabel(db) {
  const m = {
    card: 'Mobile money (Flutterwave v4)',
    wallet: 'Autexa wallet',
    pay_later: 'Cash / pay later',
    mobile_money: 'Mobile money',
  };
  return m[db] || String(db);
}
