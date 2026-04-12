import axios from 'axios';

const BASE = process.env.AIRTEL_BASE_URL || 'https://openapi.airtel.africa';
const CLIENT_ID = process.env.AIRTEL_CLIENT_ID;
const CLIENT_SECRET = process.env.AIRTEL_CLIENT_SECRET;

function stubEnabled() {
  return process.env.WALLET_PAYMENTS_STUB === '1' || process.env.WALLET_AIRTEL_STUB === '1';
}

export async function getAirtelToken() {
  if (stubEnabled()) return 'stub-airtel-token';
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Airtel Money is not configured (AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET)');
  }
  const res = await axios.post(
    `${BASE}/auth/oauth2/token`,
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  );
  return res.data.access_token;
}

export async function requestAirtelCollection({ amount, phone, externalId, description }) {
  if (stubEnabled()) {
    return { reference: externalId, status: 'pending', stub: true };
  }
  const token = await getAirtelToken();
  const msisdn = String(phone).replace(/\D/g, '');
  const res = await axios.post(
    `${BASE}/merchant/v2/payments/`,
    {
      reference: externalId,
      subscriber: { country: 'UG', currency: 'UGX', msisdn },
      transaction: {
        amount: Math.round(Number(amount)),
        country: 'UG',
        currency: 'UGX',
        id: externalId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': 'UG',
        'X-Currency': 'UGX',
        'Content-Type': 'application/json',
      },
    },
  );
  return { reference: externalId, status: 'pending', data: res.data, description };
}

export async function checkAirtelCollectionStatus(transactionId) {
  if (stubEnabled()) {
    return { status: 'PENDING' };
  }
  const token = await getAirtelToken();
  const res = await axios.get(`${BASE}/standard/v1/payments/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Country': 'UG',
      'X-Currency': 'UGX',
    },
  });
  return res.data;
}

export async function requestAirtelDisbursement({ amount, phone, externalId, description }) {
  if (stubEnabled()) {
    return { reference: externalId, status: 'pending', stub: true };
  }
  const token = await getAirtelToken();
  const msisdn = String(phone).replace(/\D/g, '');
  const res = await axios.post(
    `${BASE}/standard/v1/disbursements/`,
    {
      payee: { msisdn },
      reference: description || 'Autexa withdrawal',
      pin: process.env.AIRTEL_DISBURSE_PIN || '',
      transaction: { amount: Math.round(Number(amount)), id: externalId },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': 'UG',
        'X-Currency': 'UGX',
        'Content-Type': 'application/json',
      },
    },
  );
  return { reference: externalId, status: 'pending', data: res.data };
}
