import Constants from 'expo-constants';
import { Platform } from 'react-native';

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

function stripOuterQuotes(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Ensures https:// so Android/React Native does not treat the host as invalid. */
function normalizeSupabaseUrl(url: string): string {
  const t = trimEnv(url);
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supportUserId?: string;
  autexaApiUrl?: string;
  webAppUrl?: string;
};

function normalizeAutexaApiUrl(url: string): string {
  let t = stripOuterQuotes(trimEnv(url)).replace(/\/+$/, '');
  /** App paths always start with `/api/...`. A trailing `/api` here becomes `/api/api/...` → 404 everywhere. */
  if (/\/api$/i.test(t)) {
    t = t.replace(/\/api$/i, '').replace(/\/+$/, '');
  }
  if (!t) return '';

  // Dev convenience: map hostnames correctly per simulator/emulator only.
  // - Android emulator cannot reach host localhost; use 10.0.2.2
  // - Physical Android: use your computer's LAN IP (same Wi‑Fi) or `adb reverse tcp:8787 tcp:8787` + localhost
  // - iOS simulator can use localhost; map 10.0.2.2 back if copied from Android emulator notes
  const physicalAndroid = Platform.OS === 'android' && Constants.isDevice === true;
  if (Platform.OS === 'android' && !physicalAndroid) {
    if (t.startsWith('http://localhost:') || t.startsWith('http://127.0.0.1:')) {
      return t.replace('http://localhost:', 'http://10.0.2.2:').replace('http://127.0.0.1:', 'http://10.0.2.2:');
    }
  } else if (Platform.OS === 'ios') {
    if (t.startsWith('http://10.0.2.2:')) {
      return t.replace('http://10.0.2.2:', 'http://localhost:');
    }
  }
  return t;
}

function readExtra(): Extra {
  const fromExpo = Constants.expoConfig?.extra as Extra | undefined;
  if (fromExpo?.supabaseUrl?.trim() && fromExpo?.supabaseAnonKey?.trim()) {
    return fromExpo;
  }
  const fromManifest = Constants.manifest as { extra?: Extra } | null;
  const m = fromManifest?.extra;
  if (m?.supabaseUrl?.trim() && m?.supabaseAnonKey?.trim()) {
    return m;
  }
  return fromExpo ?? m ?? {};
}

/**
 * Prefer Babel-inlined EXPO_PUBLIC_*; fall back to app.config.js `extra` (reliable on Android).
 */
export const env = {
  supabaseUrl: normalizeSupabaseUrl(
    stripOuterQuotes(
      trimEnv(process.env.EXPO_PUBLIC_SUPABASE_URL) || trimEnv(readExtra().supabaseUrl) || '',
    ),
  ),
  supabaseAnonKey: stripOuterQuotes(
    trimEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || trimEnv(readExtra().supabaseAnonKey) || '',
  ),
  supportUserId: stripOuterQuotes(
    trimEnv(process.env.EXPO_PUBLIC_SUPPORT_USER_ID) || trimEnv(readExtra().supportUserId) || '',
  ),
  autexaApiUrl: normalizeAutexaApiUrl(
    trimEnv(process.env.EXPO_PUBLIC_AUTEXA_API_URL) || trimEnv(readExtra().autexaApiUrl) || '',
  ),
  /** Public web origin for sharing payment links (e.g. https://app.autexa.com). */
  webAppUrl: stripOuterQuotes(
    trimEnv(process.env.EXPO_PUBLIC_WEB_APP_URL) || trimEnv(readExtra().webAppUrl) || '',
  ).replace(/\/$/, ''),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function isAutexaApiConfigured(): boolean {
  return Boolean(env.autexaApiUrl);
}
