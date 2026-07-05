import type { LunaPlanId } from './types';

/** Tipos de quota rastreados na nuvem. */
export type QuotaKind = 'messages' | 'images' | 'documents' | 'voice';

export const QUOTA_KIND_LABELS: Record<QuotaKind, string> = {
  messages: 'Mensagens',
  images: 'Imagens',
  documents: 'Arquivos',
  voice: 'Voz',
};

/** Janela rolante do plano Grátis — curta o suficiente para sessões reais no mobile. */
export const FREE_QUOTA_WINDOW_HOURS = 3;
export const FREE_QUOTA_WINDOW_MS = FREE_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;

/** ID do documento Firestore `users/{uid}/usage/{docId}`. */
export const FREE_USAGE_DOC_ID = '_free_window';

/** Limites por janela no plano Grátis — espelham mobile-api/src/billing/planQuotas.ts */
export const FREE_WINDOW_LIMITS: Record<QuotaKind, number> = {
  messages: 15,
  images: 5,
  documents: 3,
  voice: 10,
};

/** Mensagens mensais em planos pagos (anexos ilimitados). */
export const PAID_MONTHLY_MESSAGE_LIMITS: Partial<Record<LunaPlanId, number>> = {
  plus: 1500,
  pro: 5000,
};

export function usesRollingWindow(planId: LunaPlanId): boolean {
  return planId === 'free';
}

export function limitsForPlan(planId: LunaPlanId): Record<QuotaKind, number | null> {
  if (planId === 'free') {
    return { ...FREE_WINDOW_LIMITS };
  }
  if (planId === 'plus' || planId === 'pro') {
    const msg = PAID_MONTHLY_MESSAGE_LIMITS[planId] ?? null;
    return {
      messages: msg,
      images: null,
      documents: null,
      voice: null,
    };
  }
  return {
    messages: null,
    images: null,
    documents: null,
    voice: null,
  };
}

/** @deprecated Preferir limitsForPlan — só mensagens mensais em planos pagos. */
export function getPlanTurnQuota(planId: LunaPlanId): number | null {
  return limitsForPlan(planId).messages;
}

export function getDaysUntilQuotaReset(): number {
  const now = new Date();
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextReset.getTime() - now.getTime()) / 86_400_000));
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatResetInHours(hours: number): string {
  if (hours <= 0) return 'em breve';
  if (hours === 1) return 'em 1 hora';
  return `em ${hours} horas`;
}

export function computeWindowResetsAt(windowStartMs: number, nowMs = Date.now()): number {
  return windowStartMs + FREE_QUOTA_WINDOW_MS;
}

export function hoursUntilReset(resetsAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((resetsAtMs - nowMs) / 3_600_000));
}
