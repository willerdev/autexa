import { env, isAutexaApiConfigured } from '../config/env';
import { supabase } from '../lib/supabase';

/** Same joining rules as `autexaFetch` (path must start with `/api/...`). */
export function autexaApiAbsoluteUrl(path: string): string {
  const base = env.autexaApiUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export class AutexaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** When the host returns Express/HTML instead of JSON (wrong URL or stale deploy). */
function shortenNonJsonErrorBody(text: string, status: number): string {
  const t = text.trim();
  if (!t) return `Request failed (${status})`;
  const cannot = t.match(/Cannot (GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (cannot) {
    return `This server does not support ${cannot[2]} (${cannot[1]}). Check EXPO_PUBLIC_AUTEXA_API_URL and deploy the latest API.`;
  }
  if (/^<!DOCTYPE html/i.test(t) || /<html[\s>]/i.test(t)) {
    return `Server returned HTML instead of JSON (${status}). Check EXPO_PUBLIC_AUTEXA_API_URL points at the Autexa Node API.`;
  }
  return t.length > 800 ? `${t.slice(0, 400)}…` : t;
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
  const url = autexaApiAbsoluteUrl(path);
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
    if (/<!DOCTYPE\s+html/i.test(msg) || /<html[\s>]/i.test(msg)) {
      msg = shortenNonJsonErrorBody(text, res.status);
    }
    if (res.status === 404 && /^not found$/i.test(msg.trim())) {
      msg = `API returned 404 for ${path}. Use EXPO_PUBLIC_AUTEXA_API_URL as the server root only (e.g. https://your-api.onrender.com), not …/api. If the URL is correct, redeploy the Node API from the latest GitHub main.`;
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
  const url = autexaApiAbsoluteUrl(path);
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
    if (/<!DOCTYPE\s+html/i.test(msg) || /<html[\s>]/i.test(msg)) {
      msg = shortenNonJsonErrorBody(text, res.status);
    }
    if (res.status === 404 && /^not found$/i.test(msg.trim())) {
      msg = `API returned 404 for ${path}. Use EXPO_PUBLIC_AUTEXA_API_URL as the server root only (e.g. https://your-api.onrender.com), not …/api. If the URL is correct, redeploy the Node API from the latest GitHub main.`;
    }
    throw new AutexaApiError(msg, res.status);
  }
  return parsed as T;
}
