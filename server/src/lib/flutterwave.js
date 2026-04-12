/**
 * Flutterwave v4 — OAuth + REST (no v3 hosted /payments redirect).
 * Wallet top-up & booking pay: customer → payment method (UG mobile money) → charge (push / payment_instruction).
 * @see https://developer.flutterwave.com/v4.0/docs/authentication
 * @see https://developer.flutterwave.com/docs/mobile-money
 */

import axios from 'axios';
import crypto from 'crypto';
import { randomUUID } from 'crypto';

const DEFAULT_TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

function getV4Base() {
  const explicit = trimEnvVal(process.env.FLUTTERWAVE_V4_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, '');
  if (trimEnvVal(process.env.FLUTTERWAVE_SANDBOX) === '1') {
    return 'https://developersandbox-api.flutterwave.com';
  }
  return 'https://api.flutterwave.com';
}

export function flutterwaveStubEnabled() {
  return process.env.WALLET_PAYMENTS_STUB === '1' || process.env.FLUTTERWAVE_STUB === '1';
}

function trimEnvVal(v) {
  if (v == null) return '';
  let s = String(v).replace(/^\uFEFF/, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

let oauthCache = { accessToken: null, expiresAtMs: 0 };

async function fetchOAuthAccessToken() {
  const clientId = trimEnvVal(process.env.FLUTTERWAVE_CLIENT_ID);
  const clientSecret = trimEnvVal(process.env.FLUTTERWAVE_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;

  if (oauthCache.accessToken && Date.now() < oauthCache.expiresAtMs - 60_000) {
    return oauthCache.accessToken;
  }

  const tokenUrl = trimEnvVal(process.env.FLUTTERWAVE_TOKEN_URL) || DEFAULT_TOKEN_URL;
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post(tokenUrl, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });
  const data = res.data;
  if (res.status >= 400 || !data?.access_token) {
    const err = data?.error_description || data?.error || res.statusText || 'token request failed';
    throw new Error(typeof err === 'string' ? err : JSON.stringify(data));
  }

  const ttlSec = Number(data.expires_in) || 600;
  oauthCache = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + ttlSec * 1000,
  };
  return oauthCache.accessToken;
}

async function requireAccessToken() {
  const t = await fetchOAuthAccessToken();
  if (!t) {
    throw new Error(
      'Flutterwave v4 requires FLUTTERWAVE_CLIENT_ID and FLUTTERWAVE_CLIENT_SECRET in server/.env (OAuth).',
    );
  }
  return t;
}

function parseV4Error(body) {
  if (!body) return 'Flutterwave request failed';
  if (body.status === 'failed' && body.error) {
    const e = body.error;
    const msg = e?.message || e?.type || JSON.stringify(e);
    const ve = e?.validation_errors;
    if (Array.isArray(ve) && ve.length) {
      return `${msg}: ${ve.map((x) => x?.message || JSON.stringify(x)).join('; ')}`;
    }
    return typeof msg === 'string' ? msg : JSON.stringify(e);
  }
  return body.message || body?.data?.message || 'Flutterwave request failed';
}

/**
 * @param {string} idempotencyKey - stable per logical operation (e.g. charge reference)
 */
async function v4Request(method, path, { jsonBody, idempotencyKey } = {}) {
  if (flutterwaveStubEnabled()) {
    throw new Error('v4Request called while stub enabled');
  }
  const base = getV4Base();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const token = await requireAccessToken();
  const traceId = randomUUID();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Trace-Id': traceId,
  };
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
  }

  const res = await axios({
    method,
    url,
    data: jsonBody,
    headers,
    validateStatus: () => true,
  });
  const body = res.data;

  if (res.status >= 400) {
    throw new Error(parseV4Error(body) || res.statusText || 'Flutterwave HTTP error');
  }
  if (body?.status === 'failed') {
    throw new Error(parseV4Error(body));
  }
  if (body?.status && body.status !== 'success') {
    throw new Error(parseV4Error(body));
  }
  return body;
}

/** National mobile digits for UG (no country code, no leading 0), e.g. 767532251 */
export function ugNationalMsisdn(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('256')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

export function normalizeUgPhoneForCharge(phone) {
  const n = ugNationalMsisdn(phone);
  return n.length ? `0${n}` : '';
}

export function normalizeUgPhoneForTransfer(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `256${d.slice(1)}`;
  if (!d.startsWith('256')) d = `256${d}`;
  return d;
}

export function providerToNetwork(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'mtn') return 'MTN';
  if (p === 'airtel') return 'AIRTEL';
  throw new Error('provider must be mtn or airtel (Flutterwave network)');
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Autexa', last: 'User' };
  if (parts.length === 1) return { first: parts[0], last: 'User' };
  return { first: parts[0], last: parts.slice(1).join(' ') || 'User' };
}

async function v4CreateCustomer({ email, fullname, phoneNational }) {
  const { first, last } = splitName(fullname);
  return v4Request('post', '/customers', {
    idempotencyKey: `cust-${crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 32)}`,
    jsonBody: {
      email: String(email).trim(),
      name: { first, last },
      phone: { country_code: '256', number: phoneNational },
    },
  });
}

async function v4CreateUgMobileMoneyPaymentMethod({ network, phoneNational }) {
  return v4Request('post', '/payment-methods', {
    idempotencyKey: `pmd-mm-${network}-${phoneNational}-${randomUUID()}`,
    jsonBody: {
      type: 'mobile_money',
      mobile_money: {
        country_code: '256',
        network,
        phone_number: phoneNational,
      },
    },
  });
}

async function v4CreateCharge({ reference, amountUgx, customerId, paymentMethodId, meta }) {
  const body = {
    reference,
    currency: 'UGX',
    amount: Math.round(Number(amountUgx)),
    customer_id: customerId,
    payment_method_id: paymentMethodId,
  };
  if (meta && typeof meta === 'object' && Object.keys(meta).length) {
    body.meta = meta;
  }
  // Intentionally no redirect_url — use push / payment_instruction flow (not hosted checkout).
  return v4Request('post', '/charges', {
    idempotencyKey: `chg-${reference}`,
    jsonBody: body,
  });
}

/**
 * Wallet top-up or booking deposit: Uganda mobile money via v4 (no browser redirect).
 */
export async function chargeUgandaMobileMoney({
  amountUgx,
  phone,
  network,
  txRef,
  email,
  fullname = 'Autexa user',
  meta,
}) {
  if (flutterwaveStubEnabled()) {
    return { stub: true, data: { status: 'pending', reference: txRef } };
  }

  const phoneNational = ugNationalMsisdn(phone);
  if (!phoneNational || phoneNational.length < 9) {
    throw new Error('Invalid Uganda phone number');
  }

  const cust = await v4CreateCustomer({
    email,
    fullname,
    phoneNational,
  });
  const customerId = cust?.data?.id;
  if (!customerId) throw new Error('Flutterwave did not return customer id');

  const pm = await v4CreateUgMobileMoneyPaymentMethod({
    network,
    phoneNational,
  });
  const paymentMethodId = pm?.data?.id;
  if (!paymentMethodId) throw new Error('Flutterwave did not return payment_method id');

  return v4CreateCharge({
    reference: String(txRef),
    amountUgx,
    customerId,
    paymentMethodId,
    meta,
  });
}

/**
 * Poll charge status by merchant reference (same value as tx_ref / external_reference).
 */
export async function verifyTransactionByTxRef(txRef) {
  if (flutterwaveStubEnabled()) {
    return { data: { status: 'pending', reference: txRef } };
  }
  const ref = encodeURIComponent(String(txRef));
  const body = await v4Request('get', `/charges?reference=${ref}&size=10`);
  const list = body?.data?.content ?? body?.data?.items ?? (Array.isArray(body?.data) ? body.data : []);
  const row = Array.isArray(list) ? list.find((c) => c.reference === txRef) || list[0] : null;
  if (!row) {
    return { data: { status: 'pending', reference: txRef } };
  }
  return {
    data: {
      ...row,
      status: row.status,
      reference: row.reference || txRef,
      tx_ref: row.reference || txRef,
    },
  };
}

/**
 * v4 direct transfer — Uganda mobile money payout (no v3 /transfers).
 */
export async function createUgMobileMoneyTransfer({
  amountUgx,
  phone,
  network,
  reference,
  narration,
  beneficiaryName = 'Autexa user',
}) {
  if (flutterwaveStubEnabled()) {
    return { data: { id: `stub-${reference}`, status: 'SUCCESSFUL', reference } };
  }

  const { first, last } = splitName(beneficiaryName);
  const msisdn = normalizeUgPhoneForTransfer(phone).replace(/^\+?/, '');
  const value = Math.round(Number(amountUgx));

  const jsonBody = {
    action: 'instant',
    type: 'mobile_money',
    reference: String(reference),
    narration: narration || 'Autexa withdrawal',
    payment_instruction: {
      source_currency: 'UGX',
      destination_currency: 'UGX',
      amount: { applies_to: 'destination_currency', value },
      recipient: {
        type: 'mobile_money',
        name: { first, last },
        mobile_money: {
          network,
          msisdn,
        },
      },
    },
  };

  return v4Request('post', '/direct-transfers', {
    idempotencyKey: `trf-${reference}`,
    jsonBody,
  });
}

/**
 * Webhook: compare `verif-hash` header to secret hash from Flutterwave dashboard.
 */
export function verifyWebhookVerifHash(verifHashHeader) {
  if (process.env.FLUTTERWAVE_WEBHOOK_SKIP_VERIFY === '1') return true;
  const expected = trimEnvVal(process.env.FLUTTERWAVE_SECRET_HASH);
  if (!expected) return false;
  if (!verifHashHeader || typeof verifHashHeader !== 'string') return false;
  const a = Buffer.from(verifHashHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
