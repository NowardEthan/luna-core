import type { PlanId } from "./planMapping.js";

import { FREE_PLAN_BRAND_NOTICE } from "../modelBrands.js";
import { ehCriadorVerificado } from "../criadorVerificado.js";

/** GLM 4.7 / Luna Core — planos pagos e trial. */
export function isPremiumModelAllowed(planId: PlanId): boolean {
  return planId !== "free";
}

/** Criador verificado usa Core (Cerebras) mesmo com plano free no Firestore. */
export function planIdForLlmRouting(uid: string | null | undefined, planId: PlanId): PlanId {
  if (uid && ehCriadorVerificado(uid) && planId === "free") return "pro";
  return planId;
}

/**
 * A0 (Latência com Alma): o provedor é único (OpenRouter) para TODOS os planos.
 * O que o plano diferencia é o MODELO (free = leve, pago = Pro), decidido em
 * `resolveOpenrouterConfig(planId)` — não a disponibilidade do provedor.
 * Mantido para compat: hoje só marca os modelos pagos legados (não filtra provedor).
 */
export function isGlm47Provider(
  _providerId?: string,
  modelKey?: string,
): boolean {
  return modelKey === "glm-47" || modelKey === "gpt-oss-120b";
}

/** A0: OpenRouter está disponível em todo plano — sem filtro de provedor. */
export function filterProviderOptionsForPlan<T extends { providerId: string; modelKey: string }>(
  _planId: PlanId,
  options: T[],
): T[] {
  return options;
}

/** A0: nunca rebaixa de provedor (não há Groq/Cerebras); só normaliza o tipo. */
export function clampProviderSelectionForPlan(
  _planId: PlanId,
  selection: { providerId: string; modelKey: string },
): {
  providerId: "groq" | "cerebras" | "openrouter" | "auto";
  modelKey: "default" | "glm-47" | "gpt-oss-120b" | "auto";
} {
  return selection as {
    providerId: "groq" | "cerebras" | "openrouter" | "auto";
    modelKey: "default" | "glm-47" | "gpt-oss-120b" | "auto";
  };
}

export const FREE_PLAN_MODEL_NOTICE = FREE_PLAN_BRAND_NOTICE;
