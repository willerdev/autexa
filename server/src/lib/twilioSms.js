import twilio from 'twilio';
import { getApiFlags } from './adminFeatureFlags.js';

function smsDisabled() {
  const v = String(process.env.TWILIO_SMS_ENABLED ?? '').toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

export function isTwilioSmsConfigured() {
  if (smsDisabled()) return false;
  const sid = String(process.env.TWILIO_ACCOUNT_SID ?? '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN ?? '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? '').trim();
  return Boolean(sid && token && from);
}

let client;

function getClient() {
  if (!isTwilioSmsConfigured()) return null;
  if (!client) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID.trim(),
      process.env.TWILIO_AUTH_TOKEN.trim(),
    );
  }
  return client;
}

/**
 * Sends SMS when Twilio env is set and TWILIO_SMS_ENABLED is not disabled.
 * Logs and swallows errors so notification paths stay resilient.
 */
export async function sendSmsIfConfigured({ to, body }) {
  try {
    const flags = await getApiFlags();
    if (flags.twilio_sms === false) {
      return { skipped: true, reason: 'admin_disabled' };
    }
  } catch (e) {
    console.warn('[twilio sms] flags read failed, continuing:', e?.message);
  }

  const c = getClient();
  if (!c) return { skipped: true };

  const from = String(process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? '').trim();
  const text = String(body ?? '').trim();
  if (!to || !text) return { skipped: true };

  try {
    const msg = await c.messages.create({ from, to, body: text.slice(0, 1600) });
    return { sid: msg.sid };
  } catch (e) {
    console.error('[twilio sms]', e?.message || e);
    return { error: e?.message || 'send failed' };
  }
}
