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

/** Nome legado — na prática marca qualquer provedor/modelo pago (GLM, DeepSeek via OpenRouter). */
export function isGlm47Provider(
  providerId?: string,
  modelKey?: string,
): boolean {
  return (
    providerId === "cerebras" ||
    providerId === "openrouter" ||
    modelKey === "glm-47" ||
    modelKey === "gpt-oss-120b"
  );
}

export function filterProviderOptionsForPlan<T extends { providerId: string; modelKey: string }>(
  planId: PlanId,
  options: T[],
): T[] {
  if (isPremiumModelAllowed(planId)) return options;
  return options.filter((o) => !isGlm47Provider(o.providerId, o.modelKey));
}

export function clampProviderSelectionForPlan(
  planId: PlanId,
  selection: { providerId: string; modelKey: string },
): {
  providerId: "groq" | "cerebras" | "openrouter" | "auto";
  modelKey: "default" | "glm-47" | "gpt-oss-120b" | "auto";
} {
  type Clamped = {
    providerId: "groq" | "cerebras" | "openrouter" | "auto";
    modelKey: "default" | "glm-47" | "gpt-oss-120b" | "auto";
  };
  if (isPremiumModelAllowed(planId)) {
    return selection as Clamped;
  }
  if (isGlm47Provider(selection.providerId, selection.modelKey)) {
    return { providerId: "groq", modelKey: "default" };
  }
  return selection as Clamped;
}

export const FREE_PLAN_MODEL_NOTICE = FREE_PLAN_BRAND_NOTICE;
