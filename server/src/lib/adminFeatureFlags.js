import { createServiceClient } from './supabase.js';

const TTL_MS = Number(process.env.ADMIN_FLAGS_CACHE_MS || 5000);

const DEFAULT_FLAGS = {
  twilio_sms: true,
  ai_chat: true,
  pitstop_assist: true,
};

let cache = { merged: null, at: 0 };

function asBool(v, fallback) {
  if (v === true || v === false) return v;
  if (v === '0' || v === 0) return false;
  if (v === '1' || v === 1) return true;
  return fallback;
}

/**
 * Merged API behaviour flags (DB overrides defaults). Cached briefly to avoid hammering Postgres.
 */
export async function getApiFlags() {
  const now = Date.now();
  if (cache.merged && now - cache.at < TTL_MS) {
    return cache.merged;
  }
  const sb = createServiceClient();
  const { data, error } = await sb.from('admin_settings').select('value').eq('key', 'api_flags').maybeSingle();
  if (error) {
    console.error('[adminFeatureFlags] read', error.message);
    cache = { merged: { ...DEFAULT_FLAGS }, at: now };
    return cache.merged;
  }
  const row = data?.value && typeof data.value === 'object' ? data.value : {};
  const merged = {
    twilio_sms: asBool(row.twilio_sms, DEFAULT_FLAGS.twilio_sms),
    ai_chat: asBool(row.ai_chat, DEFAULT_FLAGS.ai_chat),
    pitstop_assist: asBool(row.pitstop_assist, DEFAULT_FLAGS.pitstop_assist),
  };
  cache = { merged, at: now };
  return merged;
}

export async function mergeApiFlags(patch) {
  const cur = await getApiFlags();
  const next = { ...cur };
  if ('twilio_sms' in patch) next.twilio_sms = Boolean(patch.twilio_sms);
  if ('ai_chat' in patch) next.ai_chat = Boolean(patch.ai_chat);
  if ('pitstop_assist' in patch) next.pitstop_assist = Boolean(patch.pitstop_assist);

  const sb = createServiceClient();
  const { error } = await sb.from('admin_settings').upsert({
    key: 'api_flags',
    value: next,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  cache = { merged: next, at: Date.now() };
  return next;
}

export function invalidateApiFlagsCache() {
  cache = { merged: null, at: 0 };
}
