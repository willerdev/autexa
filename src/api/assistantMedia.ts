import { supabase } from '../lib/supabase';
import { isAutexaApiConfigured } from '../config/env';
import { AutexaApiError, autexaApiAbsoluteUrl } from './autexaServer';

export type AssistantAttachmentKind = 'image' | 'audio';

/**
 * Upload image or audio from assistant chat widgets; returns model summary (plain text).
 */
export async function postAssistantChatAttachment(
  kind: AssistantAttachmentKind,
  uri: string,
  mimeType: string,
  fileName: string,
): Promise<{ summary: string }> {
  if (!isAutexaApiConfigured()) {
    throw new AutexaApiError('Autexa API URL is not configured (EXPO_PUBLIC_AUTEXA_API_URL).', 0);
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new AutexaApiError('Not signed in', 401);
  }
  const path = '/api/ai/chat/attachment';
  const url = autexaApiAbsoluteUrl(path);
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const p = typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
    let msg =
      typeof p.error === 'string'
        ? p.error
        : typeof p.answer === 'string'
          ? p.answer
          : text || res.statusText;
    if (/<!DOCTYPE\s+html/i.test(msg) || /<html[\s>]/i.test(msg)) {
      const cannot = text.match(/Cannot (GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
      msg = cannot
        ? `This server does not support ${cannot[2]} (${cannot[1]}). Check EXPO_PUBLIC_AUTEXA_API_URL and deploy the latest API.`
        : `Server returned HTML instead of JSON (${res.status}). Check EXPO_PUBLIC_AUTEXA_API_URL points at the Autexa Node API.`;
    }
    if (res.status === 404 && /^not found$/i.test(String(msg).trim())) {
      msg = `API returned 404 for ${path}. Use EXPO_PUBLIC_AUTEXA_API_URL as the server root only (no trailing /api), then rebuild.`;
    }
    throw new AutexaApiError(typeof msg === 'string' ? msg : String(msg), res.status);
  }
  const summary = typeof (parsed as { summary?: string })?.summary === 'string' ? (parsed as { summary: string }).summary : '';
  return { summary: summary || 'No summary returned.' };
}
