import { getLunaBillingApiUrl, isLunaBillingApiConfigured } from '../../config/lunaBillingApi';
import type { LunaPlanId } from './types';

export type BillingPeriod = 'monthly' | 'annual';

type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

type AuthHeaders = Record<string, string>;

async function billingFetch<T>(
  path: string,
  getIdToken: () => Promise<string | null>,
  init?: RequestInit,
): Promise<T> {
  const base = getLunaBillingApiUrl();
  const token = await getIdToken();
  if (!token) throw new Error('Entre na sua conta para continuar.');

  const headers: AuthHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    ...(init?.headers as AuthHeaders | undefined),
  };

  const res = await fetch(`${base}${path}`, { ...init, headers });
  return (await res.json()) as T;
}

/** Abre checkout Asaas via servidor Luna (orbit-legacy backend). */
export async function startAsaasCheckout(
  planId: LunaPlanId,
  period: BillingPeriod,
  cpfCnpj: string,
  getIdToken: () => Promise<string | null>,
): Promise<CheckoutResult> {
  if (!isLunaBillingApiConfigured()) {
    return { ok: false, error: 'Pagamentos ainda não disponíveis nesta versão.' };
  }
  if (planId !== 'plus' && planId !== 'pro') {
    return { ok: false, error: 'Plano sem checkout.' };
  }

  try {
    const data = await billingFetch<{ ok?: boolean; url?: string; error?: string }>(
      '/v1/billing/checkout',
      getIdToken,
      {
        method: 'POST',
        body: JSON.stringify({ planId, period, cpfCnpj }),
      },
    );
    if (data.ok && data.url) return { ok: true, url: data.url };
    return { ok: false, error: data.error ?? 'Não foi possível iniciar o pagamento.' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Checkout indisponível.',
    };
  }
}

type SyncResult = { ok: boolean; plan?: string; error?: string; ignored?: boolean };

export async function syncAsaasBilling(
  getIdToken: () => Promise<string | null>,
): Promise<SyncResult> {
  if (!isLunaBillingApiConfigured()) {
    return { ok: false, error: 'Servidor de billing indisponível.' };
  }
  try {
    return await billingFetch<SyncResult>('/v1/billing/sync', getIdToken, { method: 'POST' });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sync indisponível.',
    };
  }
}

type TrialSyncResult = {
  ok: boolean;
  started?: boolean;
  expired?: boolean;
  active?: boolean;
  trialEndsAt?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export async function syncTrialBilling(
  getIdToken: () => Promise<string | null>,
): Promise<TrialSyncResult> {
  if (!isLunaBillingApiConfigured()) {
    return { ok: false, error: 'Servidor de billing indisponível.' };
  }
  try {
    return await billingFetch<TrialSyncResult>('/v1/billing/trial/sync', getIdToken, {
      method: 'POST',
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Trial indisponível.',
    };
  }
}

export async function startCreditPackCheckout(
  cpfCnpj: string,
  getIdToken: () => Promise<string | null>,
): Promise<CheckoutResult> {
  if (!isLunaBillingApiConfigured()) {
    return { ok: false, error: 'Pagamentos ainda não disponíveis nesta versão.' };
  }
  try {
    const data = await billingFetch<{ ok?: boolean; url?: string; error?: string }>(
      '/v1/billing/credit-pack',
      getIdToken,
      {
        method: 'POST',
        body: JSON.stringify({ cpfCnpj }),
      },
    );
    if (data.ok && data.url) return { ok: true, url: data.url };
    return { ok: false, error: data.error ?? 'Checkout indisponível.' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Checkout indisponível.',
    };
  }
}

export function isPlanCheckoutAvailable(): boolean {
  return isLunaBillingApiConfigured();
}
