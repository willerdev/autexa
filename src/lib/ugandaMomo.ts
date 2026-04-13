import type { MobileMoneyProvider } from '../api/wallet';

/**
 * Best-effort MTN vs Airtel from a Uganda MSISDN (0XXXXXXXXX, 256…, +256…).
 * Unknown / non-mobile prefixes return null (caller may send `auto` to the API).
 */
export function inferUgandaMomoProviderFromPhone(phone: string): 'mtn' | 'airtel' | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  let nsn = digits;
  if (digits.startsWith('256')) nsn = digits.slice(3);
  else if (digits.startsWith('0')) nsn = digits.slice(1);
  if (nsn.length < 9) return null;
  const pre = nsn.slice(0, 3);
  const mtn = new Set(['031', '039', '076', '077', '078', '079']);
  const airtel = new Set(['070', '074', '075']);
  if (mtn.has(pre)) return 'mtn';
  if (airtel.has(pre)) return 'airtel';
  return null;
}

export function resolveWalletMomoProvider(phone: string, fallback: MobileMoneyProvider = 'auto'): MobileMoneyProvider {
  return inferUgandaMomoProviderFromPhone(phone) ?? fallback;
}
