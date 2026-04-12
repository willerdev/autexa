import { createServiceClient } from './supabase.js';

export function parseDistanceKm(location) {
  if (!location || typeof location !== 'string') return 99;
  const m = location.match(/([\d.]+)\s*km/i);
  return m ? parseFloat(m[1]) : 99;
}

export async function listProvidersAvailable() {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('providers')
    .select('id,name,service_type,rating,location,is_available,base_price_cents')
    .eq('is_available', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function heuristicRank(providers, query, serviceName) {
  const q = `${query ?? ''} ${serviceName ?? ''}`.toLowerCase();
  const scored = providers.map((p) => {
    const dist = parseDistanceKm(p.location);
    const rating = Number(p.rating) || 0;
    const price = Number(p.base_price_cents) || 5000;
    let bonus = 0;
    const st = (p.service_type || '').toLowerCase();
    if (q && st && q.includes(st)) bonus += 3;
    if (q && st && st.includes(q.trim())) bonus += 2;
    const score = rating * 10 - dist * 0.8 - price / 2000 + bonus;
    return { id: p.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

function extractJsonObject(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function aiRankProviders(providers, userRequest, serviceName, systemHint) {
  const { generateJsonText } = await import('./gemini.js');
  const compact = providers.map((p) => ({
    id: p.id,
    name: p.name,
    service_type: p.service_type,
    rating: Number(p.rating),
    distance_km: parseDistanceKm(p.location),
    price_cents: p.base_price_cents ?? 5000,
    available: p.is_available,
  }));

  const prompt = `User request: "${userRequest || 'general car service'}"
Preferred service context: "${serviceName || 'any'}"

Providers (JSON):
${JSON.stringify(compact, null, 0)}

Return ONLY valid JSON (no markdown) with this shape:
{"rankedIds":["uuid",...],"topPickId":"uuid","shortReason":"one sentence for UI" }

Rules:
- Prefer higher rating, closer distance (lower distance_km), lower price_cents when relevant.
- Only include provider ids from the input list.
- rankedIds should include all providers, best first.`;

  const system =
    systemHint ||
    'You are Autexa, a car-service marketplace assistant. Output strict JSON only, no prose outside JSON.';

  let text;
  try {
    text = await generateJsonText(prompt, system);
  } catch (e) {
    console.warn('[aiRankProviders] Gemini failed, using heuristic', e?.message);
    const ids = heuristicRank(providers, userRequest, serviceName);
    return {
      rankedIds: ids,
      topPickId: ids[0] ?? null,
      shortReason: 'Matched by rating, distance, and price (offline ranking).',
      usedAi: false,
    };
  }

  const parsed = extractJsonObject(text);
  const validIds = new Set(providers.map((p) => p.id));
  if (!parsed?.rankedIds || !Array.isArray(parsed.rankedIds)) {
    const ids = heuristicRank(providers, userRequest, serviceName);
    return {
      rankedIds: ids,
      topPickId: ids[0] ?? null,
      shortReason: 'Matched by rating, distance, and price.',
      usedAi: false,
    };
  }
  const ranked = parsed.rankedIds.filter((id) => validIds.has(id));
  for (const p of providers) {
    if (!ranked.includes(p.id)) ranked.push(p.id);
  }
  const topPickId = validIds.has(parsed.topPickId) ? parsed.topPickId : ranked[0] ?? null;
  return {
    rankedIds: ranked,
    topPickId,
    shortReason: typeof parsed.shortReason === 'string' ? parsed.shortReason : 'AI-ranked for your request.',
    usedAi: true,
  };
}
