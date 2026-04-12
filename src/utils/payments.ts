import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { postCreateCheckoutSession } from '../api/aiMarketplace';
import { getErrorMessage } from '../lib/errors';

const MM_PHONE_KEY = 'autexa:mm_phone';
const MM_PROVIDER_KEY = 'autexa:mm_provider';

export type BookingMomoPayOptions = {
  phone: string;
  provider: 'mtn' | 'airtel';
};

/**
 * Flutterwave v4: start booking deposit via Uganda mobile money (push on device — no hosted checkout tab).
 */
export async function openCheckoutForBooking(
  bookingId: string,
  opts?: BookingMomoPayOptions,
): Promise<{ ok: boolean; message?: string }> {
  try {
    let phone = opts?.phone?.trim() ?? '';
    let provider: 'mtn' | 'airtel' = opts?.provider ?? 'mtn';
    if (!phone) {
      const [storedPhone, storedProv] = await AsyncStorage.multiGet([MM_PHONE_KEY, MM_PROVIDER_KEY]);
      phone = (storedPhone[1] ?? '').trim();
      if (storedProv[1] === 'airtel' || storedProv[1] === 'mtn') {
        provider = storedProv[1];
      }
    }
    if (!phone) {
      return {
        ok: false,
        message:
          'Add your MTN or Airtel number on the booking screen (or top up once in Wallet so we can remember it).',
      };
    }

    const r = await postCreateCheckoutSession(bookingId, { phone, provider });
    if (r.url) {
      await WebBrowser.openBrowserAsync(r.url);
      return { ok: true, message: r.message ?? undefined };
    }
    const msg = r.instruction || r.message;
    if (msg) {
      return { ok: true, message: msg };
    }
    return { ok: false, message: 'Payment did not start. Check Flutterwave v4 credentials on the server.' };
  } catch (e) {
    return { ok: false, message: getErrorMessage(e) };
  }
}

/** @deprecated Use openCheckoutForBooking — v4 mobile money, not Stripe. */
export const openStripeCheckoutForBooking = openCheckoutForBooking;
