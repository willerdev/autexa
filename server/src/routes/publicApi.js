import { createServiceClient } from '../lib/supabase.js';

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s ?? ''));
}

/** First public image URL from a provider_services row (cover or gallery). */
export function firstListingImage(row) {
  const direct = String(row?.image_url ?? '').trim();
  if (direct) return direct;
  const g = row?.gallery_urls;
  if (!Array.isArray(g)) return null;
  for (const x of g) {
    const u = typeof x === 'string' ? x.trim() : '';
    if (u) return u;
  }
  return null;
}

function coverUrlByProviderId(rows) {
  const bestRow = new Map();
  for (const row of rows ?? []) {
    const pid = row.provider_id;
    if (!pid) continue;
    const prev = bestRow.get(pid);
    const t = new Date(row.updated_at ?? 0).getTime();
    if (!prev || t > prev.t) bestRow.set(pid, { t, row });
  }
  const out = new Map();
  for (const { row } of bestRow.values()) {
    const url = firstListingImage(row);
    if (url) out.set(row.provider_id, url);
  }
  return out;
}

/** Marketing / web home — no auth; service role reads public-safe columns only. */
export async function publicProvidersHandler(_req, res) {
  try {
    const sb = createServiceClient();
    const { data: providers, error } = await sb
      .from('providers')
      .select('id,name,service_type,rating,location,base_price_cents,is_available')
      .eq('is_available', true)
      .order('rating', { ascending: false })
      .limit(80);
    if (error) return res.status(500).json({ error: error.message });
    const list = providers ?? [];
    if (list.length === 0) return res.json({ providers: [] });

    const ids = list.map((p) => p.id);
    const { data: listingRows, error: e2 } = await sb
      .from('provider_services')
      .select('provider_id, image_url, gallery_urls, updated_at')
      .eq('is_active', true)
      .in('provider_id', ids);
    if (e2) return res.status(500).json({ error: e2.message });

    const covers = coverUrlByProviderId(listingRows);
    const enriched = list.map((p) => ({
      ...p,
      cover_image_url: covers.get(p.id) ?? null,
    }));
    res.json({ providers: enriched });
  } catch (e) {
    console.error('[GET /public/providers]', e);
    res.status(500).json({ error: e?.message || 'failed' });
  }
}

/** Single provider + active listings (images, prices) for web detail — no auth. */
export async function publicProviderDetailHandler(req, res) {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid provider id' });

    const sb = createServiceClient();
    const { data: provider, error } = await sb
      .from('providers')
      .select('id,name,service_type,rating,location,base_price_cents,is_available')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { data: listings, error: e2 } = await sb
      .from('provider_services')
      .select('id,title,description,price_cents,image_url,gallery_urls,service_type,updated_at')
      .eq('provider_id', id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });
    if (e2) return res.status(500).json({ error: e2.message });

    const list = listings ?? [];
    let cover_image_url = null;
    for (const row of list) {
      const u = firstListingImage(row);
      if (u) {
        cover_image_url = u;
        break;
      }
    }

    res.json({
      provider: { ...provider, cover_image_url },
      listings: list,
    });
  } catch (e) {
    console.error('[GET /public/providers/:id]', e);
    res.status(500).json({ error: e?.message || 'failed' });
  }
}

export async function publicServicesHandler(_req, res) {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.from('services').select('id,name,category,slug').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ services: data ?? [] });
  } catch (e) {
    console.error('[GET /public/services]', e);
    res.status(500).json({ error: e?.message || 'failed' });
  }
}
