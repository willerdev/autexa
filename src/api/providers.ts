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
};

function parseDistanceKm(location: string): number {
  const m = location.match(/([\d.]+)\s*km/i);
  return m ? parseFloat(m[1]) : 0;
}

export function mapProviderRow(row: ProviderRow): Provider {
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
    priceEstimate: cents != null ? `from $${(cents / 100).toFixed(0)}` : 'Quote',
    specialty: row.service_type,
    location: row.location,
    basePriceCents: cents,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    isProductBusiness: Boolean(row.is_product_business),
    phone: typeof row.phone === 'string' ? row.phone : '',
    workingDays: typeof row.working_days === 'string' ? row.working_days : '',
  };
}

export async function listAvailableProviders(): Promise<{ data: Provider[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('providers')
    .select('id,name,service_type,rating,location,is_available,base_price_cents,lat,lng,is_product_business,phone,working_days')
    .eq('is_available', true)
    .order('rating', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  const rows = (data ?? []) as ProviderRow[];
  return { data: rows.map(mapProviderRow), error: null };
}
