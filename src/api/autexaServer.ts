import { env, isAutexaApiConfigured } from '../config/env';
import { supabase } from '../lib/supabase';

export class AutexaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function autexaFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  if (!isAutexaApiConfigured()) {
    throw new AutexaApiError('Autexa API URL is not configured (EXPO_PUBLIC_AUTEXA_API_URL).', 0);
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new AutexaApiError('Not signed in', 401);
  }
  const url = `${env.autexaApiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const { json: jsonBody, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  let body: BodyInit | undefined = rest.body as BodyInit;
  if (jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, { ...rest, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    let msg = text || res.statusText;
    if (typeof parsed === 'object' && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (typeof p.error === 'string' && p.error.trim()) {
        msg = p.error.trim();
      } else if (typeof p.answer === 'string' && p.answer.trim()) {
        // Some routes (e.g. /api/ai/chat) return { answer } on 4xx/5xx; use it instead of raw JSON text.
        msg = p.answer.trim();
      }
    }
    throw new AutexaApiError(msg, res.status);
  }
  return parsed as T;
}

/** Unauthenticated API calls (e.g. public payment link top-up). */
export async function autexaPublicFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  if (!isAutexaApiConfigured()) {
    throw new AutexaApiError('Autexa API URL is not configured (EXPO_PUBLIC_AUTEXA_API_URL).', 0);
  }
  const url = `${env.autexaApiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const { json: jsonBody, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  let body: BodyInit | undefined = rest.body as BodyInit;
  if (jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, { ...rest, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    let msg = text || res.statusText;
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: string }).error === 'string') {
      msg = (parsed as { error: string }).error.trim();
    }
    throw new AutexaApiError(msg, res.status);
  }
  return parsed as T;
}
