import { supabase } from '../lib/supabase';

export type PublicProviderDetail = {
  id: string;
  name: string;
  service_type: string;
  rating: number;
  location: string;
  base_price_cents: number;
  is_product_business?: boolean;
  phone?: string;
  working_days?: string;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  created_by_user_id?: string | null;
  claim_status?: string;
  delivery_mode?: 'pickup' | 'delivery' | 'both';
  delivery_area?: string;
};

export type PublicServiceDetail = {
  id: string;
  provider_id: string;
  title: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  gallery_urls: string[] | null;
};

export type ServiceReviewRow = {
  id: string;
  provider_service_id: string;
  user_id: string;
  rating: number;
  body: string;
  provider_reply: string | null;
  provider_replied_at: string | null;
  created_at: string;
  users?: { name: string } | null;
};

export async function resolveProviderServiceId(
  providerId: string,
  hint?: string | null,
): Promise<{ serviceId: string | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('provider_services')
    .select('id,title')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) return { serviceId: null, error: new Error(error.message) };
  const list = (data ?? []) as { id: string; title: string }[];
  if (!list.length) return { serviceId: null, error: null };

  if (hint?.trim()) {
    const h = hint.trim().toLowerCase();
    const hit = list.find(
      (r) =>
        r.title.toLowerCase().includes(h) ||
        h.includes(r.title.toLowerCase()) ||
        r.title.toLowerCase() === h,
    );
    if (hit) return { serviceId: hit.id, error: null };
  }

  return { serviceId: list[0].id, error: null };
}

export async function fetchPublicProvider(providerId: string): Promise<{
  data: PublicProviderDetail | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('providers')
    .select(
      'id,name,service_type,rating,location,base_price_cents,is_product_business,phone,working_days,lat,lng,image_url,gallery_urls,created_by_user_id,claim_status,delivery_mode,delivery_area',
    )
    .eq('id', providerId)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: null };
  const row = data as Record<string, unknown>;
  const g = row.gallery_urls;
  return {
    data: {
      id: row.id as string,
      name: row.name as string,
      service_type: row.service_type as string,
      rating: Number(row.rating) || 4.5,
      location: (row.location as string) ?? '',
      base_price_cents: Number(row.base_price_cents) || 0,
      is_product_business: Boolean(row.is_product_business),
      phone: typeof row.phone === 'string' ? row.phone : '',
      working_days: typeof row.working_days === 'string' ? row.working_days : '',
      lat: typeof row.lat === 'number' ? (row.lat as number) : null,
      lng: typeof row.lng === 'number' ? (row.lng as number) : null,
      image_url: (row.image_url as string | null) ?? null,
      gallery_urls: Array.isArray(g) ? (g as string[]) : [],
      created_by_user_id: (row.created_by_user_id as string | null) ?? null,
      claim_status: (row.claim_status as string | undefined) ?? 'unclaimed',
      delivery_mode: ((row.delivery_mode as string | null) ?? 'pickup') as 'pickup' | 'delivery' | 'both',
      delivery_area: (row.delivery_area as string | null) ?? '',
    },
    error: null,
  };
}

export async function fetchPublicService(serviceId: string): Promise<{
  data: PublicServiceDetail | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('provider_services')
    .select('id,provider_id,title,description,price_cents,image_url,gallery_urls,is_active')
    .eq('id', serviceId)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: null };
  const row = data as Record<string, unknown>;
  const gallery = row.gallery_urls;
  return {
    data: {
      id: row.id as string,
      provider_id: row.provider_id as string,
      title: row.title as string,
      description: (row.description as string) ?? '',
      price_cents: Number(row.price_cents) || 0,
      image_url: (row.image_url as string | null) ?? null,
      gallery_urls: Array.isArray(gallery) ? (gallery as string[]) : [],
    },
    error: null,
  };
}

export async function listServiceReviews(serviceId: string): Promise<{
  data: ServiceReviewRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('provider_service_reviews')
    .select(
      'id,provider_service_id,user_id,rating,body,provider_reply,provider_replied_at,created_at,users(name)',
    )
    .eq('provider_service_id', serviceId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as unknown as ServiceReviewRow[], error: null };
}

export async function submitServiceReview(
  serviceId: string,
  rating: number,
  body: string,
): Promise<{ error: Error | null }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { error: new Error(userErr?.message ?? 'Sign in to leave a review') };

  const { error } = await supabase.from('provider_service_reviews').insert({
    provider_service_id: serviceId,
    user_id: userData.user.id,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    body: body.trim() || '—',
  });

  if (error) {
    if (error.code === '23505' || error.message.includes('duplicate')) {
      return { error: new Error('You already reviewed this service.') };
    }
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function replyToServiceReview(reviewId: string, reply: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('submit_provider_review_reply', {
    p_review_id: reviewId,
    p_reply: reply.trim(),
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function patchProviderServiceListing(
  serviceId: string,
  patch: { price_cents?: number; gallery_urls?: string[]; image_url?: string | null },
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('provider_services').update(patch).eq('id', serviceId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export function averageRating(reviews: ServiceReviewRow[], fallback: number): number {
  if (!reviews.length) return fallback;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}
