import { toE164 } from '../lib/phoneE164.js';
import { sendSmsIfConfigured } from '../lib/twilioSms.js';

function smsBody(title, body) {
  return `${String(title ?? '').trim()}: ${String(body ?? '').trim()}`.trim().slice(0, 1600);
}

/** In-app row + optional SMS to user's profile phone. */
export async function notifyUserInAppAndSms(sb, { userId, title, body, data }) {
  await sb.from('user_notifications').insert({
    user_id: userId,
    title,
    body,
    data: data ?? null,
  });

  const { data: row } = await sb.from('users').select('phone').eq('id', userId).maybeSingle();
  const e164 = toE164(row?.phone);
  if (e164) {
    await sendSmsIfConfigured({ to: e164, body: smsBody(title, body) });
  }
}

/** Provider inbox row + optional SMS to linked auth user's phone. */
export async function notifyProviderInAppAndSms(sb, { providerId, title, body }) {
  await sb.from('provider_notifications').insert({
    provider_id: providerId,
    title,
    body,
  });

  const { data: prov } = await sb.from('providers').select('user_id').eq('id', providerId).maybeSingle();
  const uid = prov?.user_id;
  if (!uid) return;

  const { data: u } = await sb.from('users').select('phone').eq('id', uid).maybeSingle();
  const e164 = toE164(u?.phone);
  if (e164) {
    await sendSmsIfConfigured({ to: e164, body: smsBody(title, body) });
  }
}
