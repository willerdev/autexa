/**
 * Supabase Auth expects `globalThis.crypto.getRandomValues`.
 * Uses Expo's native implementation (no `react-native-get-random-values` package).
 */
import { getRandomValues as expoGetRandomValues } from 'expo-crypto';

const g = globalThis as Record<string, unknown>;

if (typeof g.crypto !== 'object' || g.crypto === null) {
  g.crypto = {};
}

const cryptoRef = g.crypto as { getRandomValues?: (a: ArrayBufferView) => ArrayBufferView };

if (typeof cryptoRef.getRandomValues !== 'function') {
  cryptoRef.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    expoGetRandomValues(array as never);
    return array;
  };
}
