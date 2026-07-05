import type { PlanId } from "./planMapping.js";

/** Tipos de quota — espelham orbit-mobile/src/features/billing/planQuotas.ts */
export type QuotaKind = "messages" | "images" | "documents" | "voice";

export const FREE_QUOTA_WINDOW_HOURS = 3;
export const FREE_QUOTA_WINDOW_MS = FREE_QUOTA_WINDOW_HOURS * 60 * 60 * 1000;

export const FREE_USAGE_DOC_ID = "_free_window";

export const FREE_WINDOW_LIMITS: Record<QuotaKind, number> = {
  messages: 15,
  images: 5,
  documents: 3,
  voice: 10,
};

export const PAID_MONTHLY_MESSAGE_LIMITS: Partial<Record<PlanId, number>> = {
  plus: 1500,
  pro: 5000,
};

export function usesRollingWindow(planId: PlanId): boolean {
  return planId === "free";
}

export function limitsForPlan(planId: PlanId): Record<QuotaKind, number | null> {
  if (planId === "free") {
    return { ...FREE_WINDOW_LIMITS };
  }
  if (planId === "plus" || planId === "pro") {
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

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function hoursUntilReset(resetsAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((resetsAtMs - nowMs) / 3_600_000));
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
