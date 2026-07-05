import type { LunaBillingState } from './types';

export function parseBilling(raw: unknown): LunaBillingState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (
    status !== 'active' &&
    status !== 'overdue' &&
    status !== 'cancelled' &&
    status !== 'trial' &&
    status !== 'expired'
  ) {
    return null;
  }
  return {
    status,
    period:
      o.period === 'annual' || o.period === 'monthly' ? o.period : undefined,
    asaasCustomerId:
      typeof o.asaasCustomerId === 'string' ? o.asaasCustomerId : undefined,
    asaasSubscriptionId:
      typeof o.asaasSubscriptionId === 'string' ? o.asaasSubscriptionId : undefined,
    nextDueDate: typeof o.nextDueDate === 'string' ? o.nextDueDate : undefined,
    trialEndsAt: typeof o.trialEndsAt === 'string' ? o.trialEndsAt : undefined,
    trialUsed: o.trialUsed === true,
    value: typeof o.value === 'number' ? o.value : undefined,
    lastEvent: typeof o.lastEvent === 'string' ? o.lastEvent : undefined,
    lastEventAt: typeof o.lastEventAt === 'string' ? o.lastEventAt : undefined,
  };
}

export function formatNextDueDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function daysUntilDate(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}
