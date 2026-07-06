import type { PlanId } from "./planMapping.js";

/** Tipos de quota — espelham Projects/Luna/orbit-mobile/src/features/billing/planQuotas.ts */
export type QuotaKind = "messages" | "images" | "documents" | "voice";

export const FREE_QUOTA_WINDOW_HOURS = 3;
export const FREE_QUOTA_WINDOW_MS = FREE_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;

export const FREE_USAGE_DOC_ID = "_free_window";

export const WINDOW_LIMITS: Record<PlanId, Record<QuotaKind, number>> = {
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

export function usesRollingWindow(planId: PlanId): boolean {
  return planId === "free" || planId === "plus" || planId === "pro";
}

export function limitsForPlan(planId: PlanId): Record<QuotaKind, number | null> {
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

export const QUOTA_KIND_LABELS: Record<QuotaKind, string> = {
  messages: "Mensagens",
  images: "Imagens",
  documents: "Arquivos",
  voice: "Voz",
};
