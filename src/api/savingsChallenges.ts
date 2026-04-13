import { autexaFetch } from './autexaServer';

export type SavingsChallenge = {
  id: string;
  creator_user_id: string;
  title: string;
  target_amount: number | string;
  starting_amount: number | string;
  currency: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'active' | 'ended' | string;
  winner_user_id: string | null;
  total_contributed: number | string;
  created_at: string;
};

export type ChallengeLeaderboardRow = {
  user_id: string;
  contributed: number;
  role?: string;
  joined_at?: string | null;
};

export async function listSavingsChallenges() {
  return autexaFetch<{ data: SavingsChallenge[] }>('/api/savings-challenges');
}

export async function createSavingsChallenge(body: {
  title?: string;
  targetAmount: number;
  startingAmount?: number;
  endsAt: string;
}) {
  return autexaFetch<SavingsChallenge>('/api/savings-challenges', { method: 'POST', json: body });
}

export async function inviteToSavingsChallenge(challengeId: string, userId: string) {
  return autexaFetch<Record<string, unknown>>(`/api/savings-challenges/${encodeURIComponent(challengeId)}/invite`, {
    method: 'POST',
    json: { userId },
  });
}

export async function acceptSavingsChallenge(challengeId: string) {
  return autexaFetch<Record<string, unknown>>(`/api/savings-challenges/${encodeURIComponent(challengeId)}/accept`, {
    method: 'POST',
  });
}

export async function contributeToSavingsChallenge(challengeId: string, body: { amount: number; source?: 'wallet' | 'savings' }) {
  return autexaFetch<Record<string, unknown>>(`/api/savings-challenges/${encodeURIComponent(challengeId)}/contribute`, {
    method: 'POST',
    json: body,
  });
}

export async function fetchSavingsChallengeDetail(challengeId: string) {
  return autexaFetch<{ challenge: SavingsChallenge; leaderboard: ChallengeLeaderboardRow[] }>(
    `/api/savings-challenges/${encodeURIComponent(challengeId)}`,
  );
}

