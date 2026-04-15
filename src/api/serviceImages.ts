import { supabase } from '../lib/supabase';

function base64ToUint8Array(base64: string): Uint8Array {
  // RN/JS: use global atob when available; fall back to Buffer if present.
  // Expo provides atob in JS runtime.
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function inferExtAndContentType(fromUri: string | null): { ext: string; contentType: string } {
  const lower = (fromUri ?? '').toLowerCase();
  const ext = lower.endsWith('.png') ? 'png' : lower.endsWith('.webp') ? 'webp' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { ext, contentType };
}

/**
 * Uploads to bucket `service-images` under `{providerId}/...` (must match storage RLS).
 */
export async function uploadServiceGalleryImageFromBase64(args: {
  providerId: string;
  base64: string;
  sourceUri?: string | null;
  bucket?: string;
}): Promise<{ url: string | null; error: Error | null }> {
  try {
    const bucket = args.bucket ?? 'pictures';
    const { ext, contentType } = inferExtAndContentType(args.sourceUri ?? null);
    const body = base64ToUint8Array(args.base64);
    const path = `${args.providerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
    });

    if (upErr) return { url: null, error: new Error(upErr.message) };

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e : new Error('Upload failed') };
  }
}

/**
 * Uploads provider listing photos (unclaimed/claimed) to bucket `service-images`
 * under `providers/{providerId}/...` to reuse existing storage config.
 */
export async function uploadProviderListingImageFromBase64(args: {
  providerId: string;
  base64: string;
  sourceUri?: string | null;
  bucket?: string;
}): Promise<{ url: string | null; error: Error | null }> {
  try {
    const bucket = args.bucket ?? 'pictures';
    const { ext, contentType } = inferExtAndContentType(args.sourceUri ?? null);
    const body = base64ToUint8Array(args.base64);
    const path = `providers/${args.providerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (upErr) return { url: null, error: new Error(upErr.message) };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e : new Error('Upload failed') };
  }
}

// Backwards-compatible exports used elsewhere in the app.
// Prefer the base64 versions for Android reliability.
export async function uploadServiceGalleryImage(providerId: string, localUri: string) {
  return { url: null, error: new Error(`Unsupported on Android without base64. Re-pick the image: ${localUri}`) };
}
