/**
 * Booking bill preview: text receipt (always) + optional Imagen image; gate before create_dynamic_booking.
 */

import { normalizeBookingPaymentMethod, paymentMethodLabel } from './bookingPayments.js';

const pendingPreviewByUser = new Map();
/** @type {Map<string, { image?: { dataBase64: string; mimeType: string }; textReceipt?: { title: string; lines: string[] } }>} */
const billBundleByUser = new Map();

const PREVIEW_TTL_MS = 30 * 60 * 1000;

export function makeBookingPreviewKey(p) {
  return [
    String(p.provider_service_id ?? ''),
    String(p.provider_id ?? ''),
    String(p.booking_date ?? '').trim(),
    String(p.booking_time ?? '').trim(),
    String(p.estimated_total ?? ''),
    String(p.service_name ?? '').trim().toLowerCase(),
  ].join('\u0001');
}

export function recordBookingPreviewAck(userId, key) {
  pendingPreviewByUser.set(userId, { key, at: Date.now() });
}

export function consumePendingBookingPreview(userId, key) {
  const row = pendingPreviewByUser.get(userId);
  if (!row || row.key !== key) return false;
  if (Date.now() - row.at > PREVIEW_TTL_MS) {
    pendingPreviewByUser.delete(userId);
    return false;
  }
  pendingPreviewByUser.delete(userId);
  return true;
}

export function mergeBillPreview(userId, partial) {
  const cur = billBundleByUser.get(userId) ?? {};
  billBundleByUser.set(userId, { ...cur, ...partial });
}

export function setBillImageForUser(userId, dataBase64, mimeType = 'image/png') {
  if (!dataBase64) return;
  mergeBillPreview(userId, { image: { dataBase64, mimeType } });
}

/**
 * Returns { image?, textReceipt? } for the HTTP client and clears stored bundle.
 */
export function takeBillPreviewForChatResponse(userId) {
  const v = billBundleByUser.get(userId);
  billBundleByUser.delete(userId);
  if (!v) return null;
  const out = {};
  if (v.image?.dataBase64) {
    out.image = { mimeType: v.image.mimeType || 'image/png', dataBase64: v.image.dataBase64 };
  }
  if (v.textReceipt?.lines?.length) {
    out.textReceipt = { title: v.textReceipt.title || 'Gearup bill', lines: v.textReceipt.lines };
  }
  return Object.keys(out).length ? out : null;
}

export function clearBookingBillPreviewState(userId) {
  pendingPreviewByUser.delete(userId);
  billBundleByUser.delete(userId);
}

export function buildTextReceiptLines({
  serviceName,
  providerName,
  bookingDate,
  bookingTime,
  totalLabel,
  paymentMethodRaw,
}) {
  const payDb = normalizeBookingPaymentMethod(paymentMethodRaw);
  const payHuman = paymentMethodLabel(payDb);
  return [
    '──────────────',
    'GEARUP · BOOKING BILL',
    '──────────────',
    `Service: ${serviceName}`,
    `Provider: ${providerName}`,
    `When: ${bookingDate} · ${bookingTime}`,
    `Total: ${totalLabel}`,
    `Payment: ${payHuman}`,
    '──────────────',
    'Review and confirm to book.',
  ];
}

function buildEnglishBillPrompt({
  serviceName,
  providerName,
  bookingDate,
  bookingTime,
  totalLabel,
  paymentMethod,
}) {
  const pay = paymentMethodLabel(normalizeBookingPaymentMethod(paymentMethod));
  return [
    'Clean professional service receipt photograph, white paper on light desk, soft studio light, high contrast readable text.',
    'Title line text: GEARUP',
    'Subtitle: BOOKING BILL',
    `Service line: ${String(serviceName).slice(0, 80)}`,
    `Provider line: ${String(providerName).slice(0, 80)}`,
    `Date and time lines: ${String(bookingDate)} — ${String(bookingTime)}`,
    `Total line: ${String(totalLabel)}`,
    `Payment: ${pay}`,
    'Minimal thin border. No faces. No logos except plain word GEARUP. Photorealistic document style, 3:4 portrait.',
  ].join(' ');
}

function extractBase64FromImagenResponse(json) {
  if (!json || typeof json !== 'object') return null;
  const tryPaths = [
    () => json.predictions?.[0]?.bytesBase64Encoded,
    () => json.predictions?.[0]?.bytes_base64_encoded,
    () => json.predictions?.[0]?.image?.bytesBase64Encoded,
    () => json.predictions?.[0]?.image?.imageBytes,
    () => json.generatedImages?.[0]?.image?.imageBytes,
    () => json.generatedImages?.[0]?.image?.bytesBase64Encoded,
    () => json.generated_images?.[0]?.image?.image_bytes,
  ];
  for (const fn of tryPaths) {
    try {
      const v = fn();
      if (typeof v === 'string' && v.replace(/\s/g, '').length > 200) {
        return v.replace(/\s/g, '');
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function generateBookingBillImage(args) {
  const prompt = buildEnglishBillPrompt(args);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  if (process.env.BOOKING_BILL_IMAGE === '0') {
    throw new Error('Bill image generation disabled (BOOKING_BILL_IMAGE=0)');
  }

  const model = process.env.GEMINI_IMAGEN_MODEL || 'imagen-4.0-fast-generate-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(key)}`;

  const instance = { prompt: prompt.slice(0, 1800) };
  const paramSets = [{ sampleCount: 1, aspectRatio: '3:4' }, { sampleCount: 1 }];

  let lastErr = 'Imagen request failed';
  for (const parameters of paramSets) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [instance], parameters }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastErr = json?.error?.message || json?.error || res.statusText;
      if (typeof lastErr !== 'string') lastErr = JSON.stringify(lastErr);
      if (process.env.BOOKING_BILL_DEBUG === '1') {
        console.warn('[Imagen] HTTP error', res.status, lastErr);
      }
      continue;
    }
    const b64 = extractBase64FromImagenResponse(json);
    if (b64) {
      return { base64: b64, mimeType: 'image/png' };
    }
    lastErr = 'Imagen returned no image bytes (unexpected response shape)';
    if (process.env.BOOKING_BILL_DEBUG === '1') {
      console.warn('[Imagen] body keys', Object.keys(json), JSON.stringify(json).slice(0, 600));
    }
  }

  throw new Error(lastErr);
}
