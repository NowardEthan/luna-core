import type { LunaPlanId } from './types';

/** Janela rolante do plano Grátis — sessões longas no mobile sem reset prematuro. */
export const FREE_QUOTA_WINDOW_HOURS = 5;
export const FREE_QUOTA_WINDOW_MS = FREE_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;

/** ID do documento Firestore `users/{uid}/usage/{docId}`. */
export const FREE_USAGE_DOC_ID = '_free_window';

/** Janela rolante semanal — teto de tokens por 7 dias (free/plus/pro). */
export const WEEKLY_USAGE_DOC_ID = '_weekly';
export const WEEKLY_QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Limites calibrados com GLM-4.7 ($2,25/M input · $2,75/M output ≈ $2,48/M blended).
 * Referência: uso intenso Pro ≈ $5/dia — estes tetos protegem margem dos planos.
 *
 * | Plano | Janela 5h | Semana | ~custo API/semana |
 * |-------|-----------|--------|-------------------|
 * | Grátis | 35k | 150k | ~$0,37 |
 * | Plus | 180k | 750k | ~$1,86 |
 * | Pro | 450k | 2,25M | ~$5,60 |
 */
export const WINDOW_TOKEN_LIMITS: Record<LunaPlanId, number> = {
  free: 35_000,
  plus: 180_000,
  pro: 450_000,
  byok: 0,
  team: 0,
};

export const WEEKLY_TOKEN_LIMITS: Record<LunaPlanId, number> = {
  free: 150_000,
  plus: 750_000,
  pro: 2_250_000,
  byok: 0,
  team: 0,
};

export function windowTokenLimitForPlan(planId: LunaPlanId): number | null {
  if (!usesRollingWindow(planId)) return null;
  return WINDOW_TOKEN_LIMITS[planId];
}

export function weeklyTokenLimitForPlan(planId: LunaPlanId): number | null {
  if (!usesRollingWindow(planId)) return null;
  return WEEKLY_TOKEN_LIMITS[planId];
}

export function computeWeeklyResetsAt(weekStartMs: number): number {
  return weekStartMs + WEEKLY_QUOTA_WINDOW_MS;
}

export function usesRollingWindow(planId: LunaPlanId): boolean {
  return planId === 'free' || planId === 'plus' || planId === 'pro';
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

export function formatResetPrecise(msUntilReset: number): string {
  if (msUntilReset <= 0) return 'em breve';
  const totalMinutes = Math.ceil(msUntilReset / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes === 1 ? 'em 1 minuto' : `em ${minutes} minutos`;
  if (minutes === 0) return hours === 1 ? 'em 1 hora' : `em ${hours} horas`;
  return `em ${hours}h ${minutes}min`;
}

export function computeWindowResetsAt(windowStartMs: number, _nowMs = Date.now()): number {
  return windowStartMs + FREE_QUOTA_WINDOW_MS;
}

export function hoursUntilReset(resetsAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((resetsAtMs - nowMs) / 3_600_000));
}

/** Formata contagem de tokens para exibição (pt-BR). */
export function formatarTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace('.', ',')} M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1_000)} mil`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace('.', ',')} mil`;
  }
  return n.toLocaleString('pt-BR');
}

/** @deprecated Preferir windowTokenLimitForPlan */
export function getPlanTurnQuota(planId: LunaPlanId): number | null {
  return windowTokenLimitForPlan(planId);
}
