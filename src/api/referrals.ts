import { autexaFetch } from './autexaServer';

export async function fetchMyReferralCode(): Promise<{ code: string }> {
  return await autexaFetch('/api/referrals/code', { method: 'GET' });
}

export async function claimReferralCode(code: string): Promise<{ ok: boolean; referrerUserId?: string }> {
  return await autexaFetch('/api/referrals/claim', { method: 'POST', json: { code } });
}

export async function maybeCreditReferral(): Promise<{ ok: boolean; credited?: boolean; amount?: number }> {
  return await autexaFetch('/api/referrals/maybe-credit', { method: 'POST' });
}

