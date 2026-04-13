export function getApiBase(): string {
  return (import.meta.env.VITE_AUTEXA_API_URL ?? '').replace(/\/$/, '');
}

export type PublicProviderRow = {
  id: string;
  name: string;
  service_type: string;
  rating: number | string | null;
  location: string | null;
  base_price_cents: number | null;
  is_available: boolean;
  /** From newest active listing cover / gallery (public API). */
  cover_image_url?: string | null;
};

export type PublicListingRow = {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  gallery_urls: string[];
  service_type: string;
  updated_at?: string;
};

export type PublicProviderDetailResponse = {
  provider: PublicProviderRow;
  listings: PublicListingRow[];
};

export type PublicServiceRow = {
  id: string;
  name: string;
  category: string;
  slug: string | null;
};

export async function fetchPublicCategories(): Promise<
  { id: string; name: string; slug: string | null; display_order: number }[]
> {
  const base = getApiBase();
  if (!base) return [];
  const res = await fetch(`${base}/api/public/categories`);
  if (!res.ok) return [];
  const j = (await res.json()) as { categories?: unknown };
  return Array.isArray(j.categories) ? (j.categories as never) : [];
}

export async function fetchPublicProviders(): Promise<PublicProviderRow[]> {
  const base = getApiBase();
  if (!base) return [];
  const res = await fetch(`${base}/api/public/providers`);
  if (!res.ok) return [];
  const j = (await res.json()) as { providers?: unknown };
  return Array.isArray(j.providers) ? (j.providers as PublicProviderRow[]) : [];
}

export async function fetchPublicProviderDetail(id: string): Promise<PublicProviderDetailResponse | null> {
  const base = getApiBase();
  if (!base) return null;
  const res = await fetch(`${base}/api/public/providers/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return (await res.json()) as PublicProviderDetailResponse;
}

export async function fetchPublicServices(): Promise<PublicServiceRow[]> {
  const base = getApiBase();
  if (!base) return [];
  const res = await fetch(`${base}/api/public/services`);
  if (!res.ok) return [];
  const j = (await res.json()) as { services?: unknown };
  return Array.isArray(j.services) ? (j.services as PublicServiceRow[]) : [];
}

export type PublicPaymentLinkMeta = {
  slug: string;
  title: string | null;
  suggested_amount_ugx: number | string | null;
  expires_at: string | null;
};

export type GuestTopupResponse = {
  success: boolean;
  topupRequestId: string;
  reference: string;
  message: string;
  expiresIn: string;
};

export type GuestTopupStatusResponse =
  | { status: 'success'; amount?: number; already_credited?: boolean }
  | { status: 'failed'; reason?: string }
  | { status: 'expired' }
  | { status: 'pending'; message?: string };

export async function fetchPublicPaymentLinkMeta(slug: string): Promise<PublicPaymentLinkMeta | null> {
  const base = getApiBase();
  if (!base) return null;
  const res = await fetch(`${base}/api/public/payment-link/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return (await res.json()) as PublicPaymentLinkMeta;
}

export async function postPublicPaymentLinkTopup(
  slug: string,
  body: { amount: number; phone: string; provider: 'mtn' | 'airtel' },
): Promise<GuestTopupResponse> {
  const base = getApiBase();
  if (!base) throw new ApiError('VITE_AUTEXA_API_URL is not set', 0);
  const res = await fetch(`${base}/api/public/payment-link/${encodeURIComponent(slug)}/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: string }).error)
        : text || res.statusText;
    throw new ApiError(msg, res.status);
  }
  return parsed as GuestTopupResponse;
}

export async function fetchGuestTopupStatus(topupRequestId: string): Promise<GuestTopupStatusResponse> {
  const base = getApiBase();
  if (!base) throw new ApiError('VITE_AUTEXA_API_URL is not set', 0);
  const res = await fetch(
    `${base}/api/public/payment-link/topup/${encodeURIComponent(topupRequestId)}/status`,
    { headers: { Accept: 'application/json' } },
  );
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: string }).error)
        : text || res.statusText;
    throw new ApiError(msg, res.status);
  }
  return parsed as GuestTopupStatusResponse;
}

export type WalletPaymentLinkRow = {
  id: string;
  slug: string;
  title: string | null;
  suggested_amount_ugx: number | string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export async function fetchWalletPaymentLinks(accessToken: string) {
  return autexaApiFetch<{ data: WalletPaymentLinkRow[] }>('/api/wallet/payment-links', accessToken, {});
}

export async function createWalletPaymentLink(
  accessToken: string,
  body: { title?: string; suggestedAmountUgx?: number | null; expiresAt?: string | null },
) {
  return autexaApiFetch<WalletPaymentLinkRow>('/api/wallet/payment-links', accessToken, {
    method: 'POST',
    json: body,
  });
}

export async function setWalletPaymentLinkActive(accessToken: string, linkId: string, active: boolean) {
  return autexaApiFetch<{ id: string; active: boolean }>(`/api/wallet/payment-links/${encodeURIComponent(linkId)}`, accessToken, {
    method: 'PATCH',
    json: { active },
  });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Authenticated calls to the main API (same as the mobile app). */
export async function autexaApiFetch<T>(
  apiPath: string,
  accessToken: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const base = getApiBase();
  if (!base) throw new ApiError('VITE_AUTEXA_API_URL is not set', 0);
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const { json, headers: h, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...(h as Record<string, string>),
  };
  let body: BodyInit | undefined = rest.body as BodyInit;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${base}${path}`, { ...rest, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: string }).error)
        : text || res.statusText;
    throw new ApiError(msg, res.status);
  }
  return parsed as T;
}

export async function adminFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const base = getApiBase();
  if (!base) throw new ApiError('VITE_AUTEXA_API_URL is not set', 0);
  const { json, headers: h, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...(h as Record<string, string>),
  };
  let body: BodyInit | undefined = rest.body as BodyInit;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${base}/api/admin${path}`, { ...rest, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: string }).error)
        : text || res.statusText;
    throw new ApiError(msg, res.status);
  }
  return parsed as T;
}
