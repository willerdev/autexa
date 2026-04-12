import { env, isSupabaseConfigured } from '../config/env';

/**
 * Dev-only: checks TLS + DNS to Supabase from the device (not your laptop).
 * If this fails, the problem is network / VPN / paused project, not app code.
 */
export async function logSupabaseReachabilityInDev(): Promise<void> {
  if (!__DEV__ || !isSupabaseConfigured()) return;
  const base = env.supabaseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      headers: { Accept: 'application/json' },
    });
    console.log('[Autexa] Supabase Auth reachable, status:', res.status);
  } catch (e) {
    console.warn(
      '[Autexa] Supabase request failed from this device. Step: same Wi‑Fi as PC? VPN off? Project active in dashboard? Try phone browser: open your Supabase URL.',
      e,
    );
  }
}
