import { supabase } from '../lib/supabase';
import { autexaFetch } from './autexaServer';

export type ProviderProfile = {
  id: string;
  name: string;
  user_id: string | null;
  service_type: string;
  location: string;
  is_available: boolean;
  base_price_cents: number;
  rating: number;
};

export type ProviderCategoryRow = {
  id: string;
  provider_id: string;
  name: string;
  created_at: string;
};

export type ProviderServiceRow = {
  id: string;
  provider_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price_cents: number;
  views_count?: number;
  image_url: string | null;
  gallery_urls?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  service_type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export async function ensureProviderProfile(): Promise<{ provider: ProviderProfile }> {
  return autexaFetch('/api/pitstop/provider/ensure-profile', { method: 'POST', json: {} });
}

export async function getMyProviderProfile(): Promise<{ data: ProviderProfile | null; error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { data: null, error: new Error(userErr?.message ?? 'Not signed in') };

  const { data, error } = await supabase
    .from('providers')
    .select('id,name,user_id,service_type,location,is_available,base_price_cents,rating')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? null) as unknown as ProviderProfile | null, error: null };
}

export async function listMyProviderCategories(providerId: string): Promise<{ data: ProviderCategoryRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('provider_categories')
    .select('id,provider_id,name,created_at')
    .eq('provider_id', providerId)
    .order('name');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as ProviderCategoryRow[], error: null };
}

export async function createProviderCategory(providerId: string, name: string): Promise<{ data: ProviderCategoryRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('provider_categories')
    .insert({ provider_id: providerId, name: name.trim() })
    .select('id,provider_id,name,created_at')
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as ProviderCategoryRow, error: null };
}

export async function deleteProviderCategory(id: string): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await supabase.from('provider_categories').delete().eq('id', id);
  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

export async function listMyProviderServices(providerId: string): Promise<{ data: (ProviderServiceRow & { provider_categories?: { name: string } | null })[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('provider_services')
    .select(
      'id,provider_id,category_id,title,description,price_cents,views_count,image_url,gallery_urls,is_active,created_at,updated_at,service_type,tags,metadata,provider_categories(name)',
    )
    .eq('provider_id', providerId)
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as any[], error: null };
}

export async function upsertProviderService(input: {
  id?: string;
  providerId: string;
  categoryId?: string | null;
  title: string;
  description: string;
  priceCents: number;
  isActive: boolean;
  serviceType?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  imageUrl?: string | null;
  galleryUrls?: string[] | null;
}): Promise<{ data: ProviderServiceRow | null; error: Error | null }> {
  const row: Record<string, unknown> = {
    id: input.id,
    provider_id: input.providerId,
    category_id: input.categoryId ?? null,
    title: input.title.trim(),
    description: input.description.trim(),
    price_cents: input.priceCents,
    is_active: input.isActive,
    service_type: (input.serviceType ?? 'general').trim().toLowerCase() || 'general',
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
  if (input.imageUrl !== undefined) row.image_url = input.imageUrl;
  if (input.galleryUrls !== undefined) row.gallery_urls = input.galleryUrls;
  const { data, error } = await supabase
    .from('provider_services')
    .upsert(row)
    .select(
      'id,provider_id,category_id,title,description,price_cents,image_url,gallery_urls,is_active,created_at,updated_at,service_type,tags,metadata',
    )
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as ProviderServiceRow, error: null };
}

export async function deleteProviderService(id: string): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await supabase.from('provider_services').delete().eq('id', id);
  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

export async function listMyProviderBookings(providerId: string): Promise<{ data: any[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,date,time,status,service_name,payment_status,payment_method,users(name,phone)')
    .eq('provider_id', providerId)
    .order('date', { ascending: false })
    .order('time', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: data ?? [], error: null };
}

export async function updateProviderBookingStatus(bookingId: string, status: string): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

