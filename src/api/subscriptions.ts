import { autexaFetch } from './autexaServer';

export type SubscriptionStatus = {
  plan: 'free' | 'professional' | string;
  status: 'active' | 'pending' | 'past_due' | 'canceled' | string;
  currentPeriodEnd: string | null;
  aiUsed: number;
  aiLimit: number;
  smsAllowed: boolean;
};

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  return await autexaFetch('/api/subscriptions/status', { method: 'GET' });
}

export async function startProfessionalUpgrade(input: { phone: string; provider?: string | null }): Promise<{ txRef: string; amountUgx: number; message: string; instruction?: string | null }> {
  return await autexaFetch('/api/subscriptions/upgrade/start', { method: 'POST', json: input });
}

