import type { PlanId } from "./planMapping.js";

import { FREE_PLAN_BRAND_NOTICE } from "../modelBrands.js";

/** GLM 4.7 / Luna Core — planos pagos e trial. */
export function isPremiumModelAllowed(planId: PlanId): boolean {
  return planId !== "free";
}

export function isGlm47Provider(
  providerId?: string,
  modelKey?: string,
): boolean {
  return providerId === "cerebras" || modelKey === "glm-47";
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
): { providerId: "groq" | "cerebras" | "auto"; modelKey: "default" | "glm-47" | "auto" } {
  if (isPremiumModelAllowed(planId)) {
    return selection as { providerId: "groq" | "cerebras" | "auto"; modelKey: "default" | "glm-47" | "auto" };
  }
  if (isGlm47Provider(selection.providerId, selection.modelKey)) {
    return { providerId: "groq", modelKey: "default" };
  }
  return selection as { providerId: "groq" | "cerebras" | "auto"; modelKey: "default" | "glm-47" | "auto" };
}

export const FREE_PLAN_MODEL_NOTICE = FREE_PLAN_BRAND_NOTICE;
