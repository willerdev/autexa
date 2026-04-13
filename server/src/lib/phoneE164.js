/**
 * Best-effort E.164 for Twilio (UG + US + generic +prefix).
 * Returns null if the value cannot be normalized.
 */
export function toE164(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = s.replace(/\D/g, '');
  if (!digits.length) return null;

  // Uganda local 0XXXXXXXXX (9 digits after 0) -> +256...
  if (digits.startsWith('0') && digits.length === 10) {
    return `+256${digits.slice(1)}`;
  }

  if (digits.startsWith('256') && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  // US 10-digit
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Uganda mobile only: +256 + 9-digit national number (12 digits total with country code).
 * Accepts 0XXXXXXXXX, 256XXXXXXXXX, or +256XXXXXXXXX.
 */
export function toUgandaE164(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  let digits;
  if (s.startsWith('+')) {
    digits = s.slice(1).replace(/\D/g, '');
  } else {
    digits = s.replace(/\D/g, '');
  }

  if (digits.startsWith('0') && digits.length === 10) {
    digits = `256${digits.slice(1)}`;
  }

  if (!digits.startsWith('256') || digits.length !== 12) {
    return null;
  }

  return `+${digits}`;
}
