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

/** Janela rolante semanal — teto de mensagens por 7 dias (free/plus/pro). */
export const WEEKLY_USAGE_DOC_ID = '_weekly';
export const WEEKLY_QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const WEEKLY_MESSAGE_LIMITS: Record<LunaPlanId, number> = {
  free: 70,
  plus: 300,
  pro: 800,
  byok: 0,
  team: 0,
};

export function weeklyMessageLimitForPlan(planId: LunaPlanId): number | null {
  if (!usesRollingWindow(planId)) return null;
  return WEEKLY_MESSAGE_LIMITS[planId];
}

export function computeWeeklyResetsAt(weekStartMs: number): number {
  return weekStartMs + WEEKLY_QUOTA_WINDOW_MS;
}

/** Limites por janela rolante — espelham mobile-api/src/billing/planQuotas.ts */
export const WINDOW_LIMITS: Record<LunaPlanId, Record<QuotaKind, number>> = {
  free: {
    messages: 15,
    images: 5,
    documents: 3,
    voice: 10,
  },
  plus: {
    messages: 60,
    images: 15,
    documents: 10,
    voice: 25,
  },
  pro: {
    messages: 150,
    images: 40,
    documents: 25,
    voice: 60,
  },
  byok: {
    messages: 0,
    images: 0,
    documents: 0,
    voice: 0,
  },
  team: {
    messages: 0,
    images: 0,
    documents: 0,
    voice: 0,
  },
};

export function usesRollingWindow(planId: LunaPlanId): boolean {
  return planId === 'free' || planId === 'plus' || planId === 'pro';
}

export function limitsForPlan(planId: LunaPlanId): Record<QuotaKind, number | null> {
  if (usesRollingWindow(planId)) {
    return { ...WINDOW_LIMITS[planId] };
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

export function formatResetPrecise(msUntilReset: number): string {
  if (msUntilReset <= 0) return 'em breve';
  const totalMinutes = Math.ceil(msUntilReset / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes === 1 ? 'em 1 minuto' : `em ${minutes} minutos`;
  if (minutes === 0) return hours === 1 ? 'em 1 hora' : `em ${hours} horas`;
  return `em ${hours}h ${minutes}min`;
}

export function computeWindowResetsAt(windowStartMs: number, nowMs = Date.now()): number {
  return windowStartMs + FREE_QUOTA_WINDOW_MS;
}

export function hoursUntilReset(resetsAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((resetsAtMs - nowMs) / 3_600_000));
}
