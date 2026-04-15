import { autexaFetch } from './autexaServer';

export type TwofaStatus = { twofaEnabled: boolean; phone: string | null };

export async function fetchTwofaStatus(): Promise<TwofaStatus> {
  return await autexaFetch('/api/2fa/status', { method: 'GET' });
}

export async function startTwofaEnable(): Promise<{ ok: boolean; challengeId?: string; expiresAt?: string; alreadyEnabled?: boolean }> {
  return await autexaFetch('/api/2fa/enable/start', { method: 'POST' });
}

export async function confirmTwofaEnable(input: { challengeId: string; code: string }): Promise<{ ok: boolean; twofaEnabled?: boolean }> {
  return await autexaFetch('/api/2fa/enable/confirm', { method: 'POST', json: input });
}

export async function startTwofaLoginChallenge(): Promise<{ ok: boolean; skipped?: boolean; challengeId?: string; expiresAt?: string }> {
  return await autexaFetch('/api/2fa/challenge/start', { method: 'POST' });
}

export async function verifyTwofaLoginChallenge(input: { challengeId: string; code: string }): Promise<{ ok: boolean; verified?: boolean }> {
  return await autexaFetch('/api/2fa/challenge/verify', { method: 'POST', json: input });
}

