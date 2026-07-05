export type LunaPlanId = 'free' | 'plus' | 'pro' | 'byok' | 'team';

export type LunaBillingState = {
  status: 'active' | 'overdue' | 'cancelled' | 'trial' | 'expired';
  period?: 'monthly' | 'annual';
  asaasCustomerId?: string;
  asaasSubscriptionId?: string;
  nextDueDate?: string;
  trialEndsAt?: string;
  trialUsed?: boolean;
  value?: number;
  lastEvent?: string;
  lastEventAt?: string;
};

export function parsePlanId(raw: unknown): LunaPlanId {
  const p = raw;
  if (p === 'plus' || p === 'pro' || p === 'byok' || p === 'team') return p;
  return 'free';
}
