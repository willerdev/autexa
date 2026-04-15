import { supabase } from '../lib/supabase';

/**
 * Uploads to bucket `service-images` under `{providerId}/...` (must match storage RLS).
 */
export async function uploadServiceGalleryImage(
  providerId: string,
  localUri: string,
): Promise<{ url: string | null; error: Error | null }> {
  const lower = localUri.toLowerCase();
  const ext = lower.endsWith('.png') ? 'png' : lower.endsWith('.webp') ? 'webp' : 'jpg';
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${providerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const res = await fetch(localUri);
  const blob = await res.blob();

  const { error: upErr } = await supabase.storage.from('service-images').upload(path, blob, {
    contentType,
    upsert: false,
  });

  if (upErr) return { url: null, error: new Error(upErr.message) };

  const { data } = supabase.storage.from('service-images').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

/**
 * Uploads provider listing photos (unclaimed/claimed) to bucket `service-images`
 * under `providers/{providerId}/...` to reuse existing storage config.
 */
export async function uploadProviderListingImage(
  providerId: string,
  localUri: string,
): Promise<{ url: string | null; error: Error | null }> {
  const lower = localUri.toLowerCase();
  const ext = lower.endsWith('.png') ? 'png' : lower.endsWith('.webp') ? 'webp' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `providers/${providerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const res = await fetch(localUri);
  const blob = await res.blob();
  const { error: upErr } = await supabase.storage.from('service-images').upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (upErr) return { url: null, error: new Error(upErr.message) };
  const { data } = supabase.storage.from('service-images').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
