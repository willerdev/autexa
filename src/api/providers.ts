import type { Provider } from '../types';
import { supabase } from '../lib/supabase';

export type ProviderRow = {
  id: string;
  name: string;
  service_type: string;
  rating: number | string;
  location: string;
  is_available: boolean;
  base_price_cents?: number | null;
  lat?: number | null;
  lng?: number | null;
  is_product_business?: boolean;
  phone?: string | null;
  working_days?: string | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
};

type ServiceRowLite = {
  id: string;
  name: string;
  slug: string | null;
  category: string;
};

function parseDistanceKm(location: string): number {
  const m = location.match(/([\d.]+)\s*km/i);
  return m ? parseFloat(m[1]) : 0;
}

function normKey(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function deriveServiceCategory(serviceType: string, services: ServiceRowLite[]): string | null {
  const t = normKey(serviceType);
  if (!t) return null;
  const bySlug = services.find((s) => s.slug && normKey(s.slug) === t);
  if (bySlug?.category) return bySlug.category;
  const byName = services.find((s) => normKey(s.name) === t);
  if (byName?.category) return byName.category;
  // Fuzzy fallback: "Tow Truck" vs "Tow Truck service", etc.
  const byIncludes = services.find((s) => {
    const n = normKey(s.name);
    return n && (n.includes(t) || t.includes(n));
  });
  return byIncludes?.category ?? null;
}

export function mapProviderRow(row: ProviderRow, serviceCategory?: string | null): Provider {
  const rating = typeof row.rating === 'string' ? parseFloat(row.rating) : row.rating;
  const r = Number.isFinite(rating) ? rating : 4.5;
  const cents =
    row.base_price_cents != null && Number.isFinite(Number(row.base_price_cents))
      ? Math.round(Number(row.base_price_cents))
      : undefined;
  return {
    id: row.id,
    name: row.name,
    rating: r,
    reviewCount: Math.max(12, Math.round(r * 28)),
    distanceKm: parseDistanceKm(row.location),
    priceEstimate: cents != null ? `from UGX ${Math.round(cents / 100).toLocaleString()}` : 'Quote',
    specialty: row.service_type,
    serviceCategory: serviceCategory ?? null,
    location: row.location,
    basePriceCents: cents,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    isProductBusiness: Boolean(row.is_product_business),
    phone: typeof row.phone === 'string' ? row.phone : '',
    workingDays: typeof row.working_days === 'string' ? row.working_days : '',
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    galleryUrls: Array.isArray(row.gallery_urls) ? row.gallery_urls : null,
  };
}

export async function listAvailableProviders(): Promise<{ data: Provider[]; error: Error | null }> {
  const [provRes, svcRes] = await Promise.all([
    supabase
      .from('providers')
      .select(
        'id,name,service_type,rating,location,is_available,base_price_cents,lat,lng,is_product_business,phone,working_days,image_url,gallery_urls',
      )
      .eq('is_available', true)
      .order('rating', { ascending: false }),
    supabase.from('services').select('id,name,slug,category').order('name'),
  ]);

  if (provRes.error) return { data: [], error: new Error(provRes.error.message) };
  if (svcRes.error) return { data: [], error: new Error(svcRes.error.message) };

  const services = (svcRes.data ?? []) as unknown as ServiceRowLite[];
  const rows = (provRes.data ?? []) as ProviderRow[];
  return {
    data: rows.map((r) => mapProviderRow(r, deriveServiceCategory(r.service_type, services))),
    error: null,
  };
}
