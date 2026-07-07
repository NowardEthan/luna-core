import type { PlanId } from "./planMapping.js";

export const FREE_QUOTA_WINDOW_HOURS = 5;
export const FREE_QUOTA_WINDOW_MS = FREE_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;

export const FREE_USAGE_DOC_ID = "_free_window";

export const WEEKLY_USAGE_DOC_ID = "_weekly";
export const WEEKLY_QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Limites calibrados com GLM-4.7 ($2,25/M input · $2,75/M output ≈ $2,48/M blended).
 * Ver comentário em orbit-mobile planQuotas.ts para tabela de custos.
 */
export const WINDOW_TOKEN_LIMITS: Record<PlanId, number> = {
  free: 35_000,
  plus: 180_000,
  pro: 450_000,
  byok: 0,
  team: 0,
};

export const WEEKLY_TOKEN_LIMITS: Record<PlanId, number> = {
  free: 150_000,
  plus: 750_000,
  pro: 2_250_000,
  byok: 0,
  team: 0,
};

export function windowTokenLimitForPlan(planId: PlanId): number | null {
  if (!usesRollingWindow(planId)) return null;
  return WINDOW_TOKEN_LIMITS[planId];
}

export function weeklyTokenLimitForPlan(planId: PlanId): number | null {
  if (!usesRollingWindow(planId)) return null;
  return WEEKLY_TOKEN_LIMITS[planId];
}

export function computeWeeklyResetsAt(weekStartMs: number): number {
  return weekStartMs + WEEKLY_QUOTA_WINDOW_MS;
}

export function usesRollingWindow(planId: PlanId): boolean {
  return planId === "free" || planId === "plus" || planId === "pro";
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function hoursUntilReset(resetsAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((resetsAtMs - nowMs) / 3_600_000));
}

export function formatResetPrecise(msUntilReset: number): string {
  if (msUntilReset <= 0) return "em breve";
  const totalMinutes = Math.ceil(msUntilReset / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes === 1 ? "em 1 minuto" : `em ${minutes} minutos`;
  if (minutes === 0) return hours === 1 ? "em 1 hora" : `em ${hours} horas`;
  return `em ${hours}h ${minutes}min`;
}

export function computeWindowResetsAt(windowStartMs: number): number {
  return windowStartMs + FREE_QUOTA_WINDOW_MS;
}
