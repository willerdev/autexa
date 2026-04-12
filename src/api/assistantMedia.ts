import { supabase } from '../lib/supabase';
import { env, isAutexaApiConfigured } from '../config/env';
import { AutexaApiError } from './autexaServer';

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
  const url = `${env.autexaApiUrl}/api/ai/chat/attachment`;
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
    const msg =
      typeof p.error === 'string'
        ? p.error
        : typeof p.answer === 'string'
          ? p.answer
          : text || res.statusText;
    throw new AutexaApiError(msg, res.status);
  }
  const summary = typeof (parsed as { summary?: string })?.summary === 'string' ? (parsed as { summary: string }).summary : '';
  return { summary: summary || 'No summary returned.' };
}
