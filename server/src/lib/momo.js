import axios from 'axios';

const BASE = process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const SUB_KEY = process.env.MTN_SUBSCRIPTION_KEY;
const API_USER = process.env.MTN_API_USER;
const API_KEY = process.env.MTN_API_KEY;
const ENV = process.env.MTN_ENVIRONMENT || 'sandbox';

function stubEnabled() {
  return process.env.WALLET_PAYMENTS_STUB === '1' || process.env.WALLET_MOMO_STUB === '1';
}

export async function getMtnToken() {
  if (stubEnabled()) return 'stub-token';
  if (!API_USER || !API_KEY || !SUB_KEY) {
    throw new Error('MTN MoMo is not configured (MTN_API_USER, MTN_API_KEY, MTN_SUBSCRIPTION_KEY)');
  }
  const credentials = Buffer.from(`${API_USER}:${API_KEY}`).toString('base64');
  const res = await axios.post(
    `${BASE}/collection/token/`,
    {},
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': SUB_KEY,
      },
    },
  );
  return res.data.access_token;
}

export async function requestMtnCollection({ amount, phone, externalId, description }) {
  if (stubEnabled()) {
    return { reference: externalId, status: 'pending', stub: true };
  }
  const token = await getMtnToken();
  await axios.post(
    `${BASE}/collection/v1_0/requesttopay`,
    {
      amount: String(Math.round(Number(amount))),
      currency: 'UGX',
      externalId,
      payer: { partyIdType: 'MSISDN', partyId: String(phone).replace(/\D/g, '') },
      payerMessage: description || 'Gearup wallet',
      payeeNote: 'Gearup Wallet Top-up',
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': externalId,
        'X-Target-Environment': ENV,
        'Ocp-Apim-Subscription-Key': SUB_KEY,
        'Content-Type': 'application/json',
      },
    },
  );
  return { reference: externalId, status: 'pending' };
}

export async function checkMtnCollectionStatus(referenceId) {
  if (stubEnabled()) {
    return { status: 'PENDING' };
  }
  const token = await getMtnToken();
  const res = await axios.get(`${BASE}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': ENV,
      'Ocp-Apim-Subscription-Key': SUB_KEY,
    },
  });
  return res.data;
}

export async function requestMtnDisbursement({ amount, phone, externalId, description }) {
  if (stubEnabled()) {
    return { reference: externalId, status: 'pending', stub: true };
  }
  const disbKey = process.env.MTN_DISBURSEMENT_KEY || SUB_KEY;
  const token = await getMtnToken();
  await axios.post(
    `${BASE}/disbursement/v1_0/transfer`,
    {
      amount: String(Math.round(Number(amount))),
      currency: 'UGX',
      externalId,
      payee: { partyIdType: 'MSISDN', partyId: String(phone).replace(/\D/g, '') },
      payerMessage: description || 'Gearup withdrawal',
      payeeNote: 'Gearup Withdrawal',
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': externalId,
        'X-Target-Environment': ENV,
        'Ocp-Apim-Subscription-Key': disbKey,
        'Content-Type': 'application/json',
      },
    },
  );
  return { reference: externalId, status: 'pending' };
}
