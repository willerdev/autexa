import { autexaFetch, autexaPublicFetch } from './autexaServer';

export type Wallet = {
  id: string;
  user_id: string;
  balance: number | string;
  savings_balance?: number | string;
  currency: string;
  is_locked: boolean;
  locked_reason: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function fetchWallet() {
  return autexaFetch<Wallet>('/api/wallet');
}

export type TopupResponse = {
  success: boolean;
  topupRequestId: string;
  reference: string;
  message: string;
  expiresIn: string;
};

export async function requestWalletTopup(body: { amount: number; phone: string; provider: 'mtn' | 'airtel' }) {
  return autexaFetch<TopupResponse>('/api/wallet/topup', { method: 'POST', json: body });
}

export type TopupStatusResponse =
  | { status: 'success'; amount?: number; already_credited?: boolean }
  | { status: 'failed'; reason?: string }
  | { status: 'expired' }
  | { status: 'pending'; message?: string };

export async function fetchTopupStatus(topupRequestId: string) {
  return autexaFetch<TopupStatusResponse>(`/api/wallet/topup/${encodeURIComponent(topupRequestId)}/status`);
}

export type WithdrawResponse = {
  success: boolean;
  amount: number;
  fee: number;
  net: number;
  message: string;
};

export async function requestWalletWithdraw(body: { amount: number; phone: string; provider: 'mtn' | 'airtel' }) {
  return autexaFetch<WithdrawResponse>('/api/wallet/withdraw', { method: 'POST', json: body });
}

export type SavingsTransferResponse = {
  success: boolean;
  wallet_balance: number | string;
  savings_balance: number | string;
};

export async function depositToSavings(body: { amount: number; description?: string }) {
  return autexaFetch<SavingsTransferResponse>('/api/wallet/savings/deposit', { method: 'POST', json: body });
}

export async function withdrawFromSavings(body: { amount: number; description?: string }) {
  return autexaFetch<SavingsTransferResponse>('/api/wallet/savings/withdraw', { method: 'POST', json: body });
}

export type WalletTransaction = {
  id: string;
  type: string;
  amount: number | string;
  fee?: number | string;
  currency?: string;
  status: string;
  description: string | null;
  payment_method: string | null;
  initiated_by?: string;
  created_at: string;
  completed_at?: string | null;
  counterparty_user_id?: string | null;
};

export type WalletTransactionsPage = {
  data: WalletTransaction[];
  total: number;
  page: number;
};

export async function fetchWalletTransactions(params?: { page?: number; limit?: number; type?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.type) q.set('type', params.type);
  const qs = q.toString();
  return autexaFetch<WalletTransactionsPage>(`/api/wallet/transactions${qs ? `?${qs}` : ''}`);
}

export type PayProviderResponse = Record<string, unknown>;

export async function payProviderFromWallet(body: {
  providerUserId: string;
  amount: number;
  bookingId?: string;
  description?: string;
}) {
  return autexaFetch<PayProviderResponse>('/api/wallet/pay-provider', { method: 'POST', json: body });
}

export type WalletPayee = {
  id: string;
  label: string;
  payee_user_id: string;
  provider_id: string | null;
  created_at?: string;
  providers?: { name: string } | null;
};

export type WalletPayeesResponse = { data: WalletPayee[] };

export async function fetchWalletPayees() {
  return autexaFetch<WalletPayeesResponse>('/api/wallet/payees');
}

export async function addWalletPayee(body: { label: string; providerId?: string; payeeUserId?: string }) {
  return autexaFetch<WalletPayee>('/api/wallet/payees', { method: 'POST', json: body });
}

export async function removeWalletPayee(payeeId: string) {
  return autexaFetch<{ success: boolean }>(`/api/wallet/payees/${encodeURIComponent(payeeId)}`, {
    method: 'DELETE',
  });
}

export async function transferToWalletPayee(body: { payeeId: string; amount: number; description?: string }) {
  return autexaFetch<Record<string, unknown>>('/api/wallet/transfer-payee', { method: 'POST', json: body });
}

export type WalletPaymentLinkRow = {
  id: string;
  slug: string;
  title: string | null;
  suggested_amount_ugx: number | string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export async function fetchWalletPaymentLinks() {
  return autexaFetch<{ data: WalletPaymentLinkRow[] }>('/api/wallet/payment-links');
}

export async function createWalletPaymentLink(body: {
  title?: string;
  suggestedAmountUgx?: number | null;
  expiresAt?: string | null;
}) {
  return autexaFetch<WalletPaymentLinkRow>('/api/wallet/payment-links', { method: 'POST', json: body });
}

export async function setWalletPaymentLinkActive(linkId: string, active: boolean) {
  return autexaFetch<{ id: string; active: boolean }>(`/api/wallet/payment-links/${encodeURIComponent(linkId)}`, {
    method: 'PATCH',
    json: { active },
  });
}

export type PublicPaymentLinkMeta = {
  slug: string;
  title: string | null;
  suggested_amount_ugx: number | string | null;
  expires_at: string | null;
};

export async function fetchPublicPaymentLinkMeta(slug: string): Promise<PublicPaymentLinkMeta | null> {
  try {
    return await autexaPublicFetch<PublicPaymentLinkMeta>(
      `/api/public/payment-link/${encodeURIComponent(slug)}`,
    );
  } catch {
    return null;
  }
}

export async function postPublicPaymentLinkTopup(
  slug: string,
  body: { amount: number; phone: string; provider: 'mtn' | 'airtel' },
) {
  return autexaPublicFetch<TopupResponse>(`/api/public/payment-link/${encodeURIComponent(slug)}/topup`, {
    method: 'POST',
    json: body,
  });
}

export async function fetchGuestTopupStatus(topupRequestId: string) {
  return autexaPublicFetch<TopupStatusResponse>(
    `/api/public/payment-link/topup/${encodeURIComponent(topupRequestId)}/status`,
  );
}
