import type { Provider } from '../types';
import type { ChatWidgetSpec } from '../types/chatWidgets';
import type { UserAiContext } from '../types/aiContext';
import { inferLocalChatWidgets } from '../utils/inferChatWidgets';
import { listAvailableProviders } from './providers';
import { autexaFetch } from './autexaServer';

export type AiRecommendResponse = {
  rankedIds: string[];
  topPickId: string | null;
  shortReason: string;
  usedAi: boolean;
  providers: {
    id: string;
    name: string;
    service_type: string;
    rating: number;
    location: string;
    base_price_cents: number;
    is_available: boolean;
  }[];
};

export async function postAiRecommend(query: string, serviceName: string): Promise<AiRecommendResponse> {
  return autexaFetch<AiRecommendResponse>('/api/ai/recommend', {
    method: 'POST',
    json: { query, serviceName },
  });
}

export async function postAiChat(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{
  reply: string;
}> {
  return autexaFetch('/api/ai/chat', {
    method: 'POST',
    json: { messages },
  });
}

export type ChatBillPreviewPayload = {
  image?: { mimeType: string; dataBase64: string };
  textReceipt?: { title: string; lines: string[] };
};

/** Gemini tool-calling chat: server runs DB tools then answers from real rows. */
export async function postAiToolChat(message: string): Promise<{
  answer: string;
  widgets?: ChatWidgetSpec[];
  billPreview?: ChatBillPreviewPayload;
}> {
  const raw = await autexaFetch<{
    answer: string;
    widgets?: ChatWidgetSpec[];
    billPreview?: ChatBillPreviewPayload;
  }>('/api/ai/chat', {
    method: 'POST',
    json: { message },
  });
  const answer = raw.answer ?? '';
  let widgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  if (!widgets.length) {
    const guessed = inferLocalChatWidgets(answer, message);
    if (guessed.length) {
      widgets = guessed;
    }
  }
  const bp = raw.billPreview;
  const hasBill = Boolean(bp?.image?.dataBase64 || bp?.textReceipt?.lines?.length);
  return {
    answer,
    widgets: widgets.length ? widgets : undefined,
    billPreview: hasBill ? bp : undefined,
  };
}

export async function deleteAiToolChatHistory(): Promise<{ success: boolean }> {
  return autexaFetch('/api/ai/chat/history', {
    method: 'DELETE',
  });
}

export async function getAiContext(): Promise<{ context: UserAiContext }> {
  return autexaFetch('/api/ai/context', {
    method: 'GET',
  });
}

// Pitstop-style assistant: tool-only (services/providers/bookings) — no generic advice.
export async function postAskAutexa(text: string): Promise<{
  reply: string;
  service: { id: string; name: string } | null;
  providers: { id: string; name: string; price_cents: number; rating: number; distance_km: number; availability: string }[];
  action?: { type: string; bookings?: any[] };
}> {
  return autexaFetch('/api/pitstop/assist', {
    method: 'POST',
    json: { text },
  });
}

export async function postCancelBookingAutexa(body: { bookingId: string; reason?: string }): Promise<{ ok: boolean; booking: { id: string } }> {
  return autexaFetch('/api/pitstop/cancel-booking', {
    method: 'POST',
    json: body,
  });
}

export async function postUpdateBookingAutexa(body: {
  bookingId: string;
  date?: string;
  time?: string;
  paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
}): Promise<{ ok: boolean; booking: any }> {
  return autexaFetch('/api/pitstop/update-booking', {
    method: 'POST',
    json: body,
  });
}

export async function postAutoBookAutexa(body: {
  text: string;
  strategy?: 'cheapest' | 'best' | 'nearest' | 'best_rated';
  serviceName?: string;
  date?: string;
  time?: string;
  paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
}): Promise<{
  booking: { id: string };
  provider: { id: string; name: string; price_cents: number; rating: number; distance_km: number; availability: string };
  service: { id: string | null; name: string };
  billPreview?: ChatBillPreviewPayload;
}> {
  return autexaFetch('/api/pitstop/auto-book', {
    method: 'POST',
    json: body,
  });
}

export async function postAnalyzeDamage(form: FormData): Promise<{
  analysis: {
    issue: string;
    severity: string;
    estimatedRepairUsdMin: number;
    estimatedRepairUsdMax: number;
    notes: string;
  };
}> {
  return autexaFetch('/api/ai/analyze-damage', {
    method: 'POST',
    body: form,
  });
}

export async function postRecognizeCar(form: FormData): Promise<{
  car: { make: string; model: string; year: string; plate: string; confidence: number; notes: string };
}> {
  return autexaFetch('/api/ai/recognize-car', {
    method: 'POST',
    body: form,
  });
}

export async function postAnalyzeCarScan(form: FormData): Promise<{
  result: {
    summary: string;
    issues: { label: string; severity: 'low' | 'medium' | 'high'; notes: string }[];
    suggestions: { serviceKeyword: string; reason: string; urgency: 'normal' | 'soon' | 'urgent' }[];
  };
}> {
  return autexaFetch('/api/ai/analyze-car-scan', {
    method: 'POST',
    body: form,
  });
}

export async function postDescribeServiceImage(form: FormData): Promise<{
  suggestion: { title: string; description: string };
}> {
  return autexaFetch('/api/ai/describe-service-image', {
    method: 'POST',
    body: form,
  });
}

export async function postAutoSelectBooking(body: {
  date: string;
  time: string;
  serviceName?: string;
  amountCents?: number;
}): Promise<{ bookingId: string; providerId: string; providerName: string; aiReason: string }> {
  return autexaFetch('/api/bookings/auto-select', {
    method: 'POST',
    json: body,
  });
}

export type CreateCheckoutSessionResponse = {
  url: string | null;
  txRef?: string;
  sessionId?: string;
  message?: string | null;
  instruction?: string | null;
  amountUgx?: number;
};

/** Flutterwave v4: Uganda mobile money deposit (no hosted checkout URL). */
export async function postCreateCheckoutSession(
  bookingId: string,
  body: { phone: string; provider: 'mtn' | 'airtel' },
): Promise<CreateCheckoutSessionResponse> {
  return autexaFetch('/api/payments/create-checkout-session', {
    method: 'POST',
    json: { bookingId, phone: body.phone, provider: body.provider },
  });
}

export async function registerPushToken(expoPushToken: string, platform: string): Promise<void> {
  await autexaFetch('/api/push/register-token', {
    method: 'POST',
    json: { expoPushToken, platform },
  });
}

/** Merge AI ranking + local provider models for UI. */
export function applyAiRanking(local: Provider[], rankedIds: string[], topPickId: string | null): Provider[] {
  const map = new Map(local.map((p) => [p.id, { ...p }]));
  const ordered: Provider[] = [];
  for (const id of rankedIds) {
    const p = map.get(id);
    if (p) {
      ordered.push(p);
      map.delete(id);
    }
  }
  for (const p of map.values()) {
    ordered.push(p);
  }
  return ordered.map((p) => ({
    ...p,
    aiRecommended: p.id === topPickId,
  }));
}

/** When API is down, still return providers from Supabase only. */
export async function loadProvidersWithOptionalAi(
  serviceName: string,
  userQuery: string,
): Promise<{ providers: Provider[]; aiNote: string | null }> {
  const { data, error } = await listAvailableProviders();
  if (error) {
    return { providers: [], aiNote: null };
  }
  try {
    const rec = await postAiRecommend(userQuery || serviceName, serviceName);
    const ranked = applyAiRanking(data, rec.rankedIds, rec.topPickId);
    const top = ranked.find((p) => p.aiRecommended);
    if (top && rec.shortReason) {
      top.aiReason = rec.shortReason;
    }
    return {
      providers: ranked,
      aiNote: rec.usedAi ? rec.shortReason : `Smart rank: ${rec.shortReason}`,
    };
  } catch {
    return { providers: data, aiNote: null };
  }
}
