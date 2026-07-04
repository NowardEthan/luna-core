export type PlanId = "free" | "plus" | "pro" | "byok" | "team";
export type BillingPeriod = "monthly" | "annual";

export const PLAN_CATALOG: Record<
  `${"plus" | "pro" | "byok"}-${BillingPeriod}`,
  { value: number; cycle: "MONTHLY" | "YEARLY"; label: string }
> = {
  "plus-monthly": { value: 25, cycle: "MONTHLY", label: "Luna Plus Mensal" },
  "plus-annual": { value: 250, cycle: "YEARLY", label: "Luna Plus Anual" },
  "pro-monthly": { value: 49, cycle: "MONTHLY", label: "Luna Pro Mensal" },
  "pro-annual": { value: 490, cycle: "YEARLY", label: "Luna Pro Anual" },
  "byok-monthly": { value: 12, cycle: "MONTHLY", label: "Luna BYOK Mensal" },
  "byok-annual": { value: 120, cycle: "YEARLY", label: "Luna BYOK Anual" },
};

const VALID_PLAN_IDS = new Set<PlanId>(["free", "plus", "pro", "byok", "team"]);

export function isValidPlanId(planId: string): planId is PlanId {
  return VALID_PLAN_IDS.has(planId as PlanId);
}

export function getPlanCatalog(planId: string, period: string) {
  if (planId !== "plus" && planId !== "pro" && planId !== "byok") return null;
  const per: BillingPeriod = period === "annual" ? "annual" : "monthly";
  return PLAN_CATALOG[`${planId}-${per}` as keyof typeof PLAN_CATALOG] ?? null;
}

export function entitlementsForPlan(planId: string): Record<string, boolean> {
  return {
    hostedLlm: true,
    marketplaceRemote: true,
    marketplacePublish: planId !== "free",
    webSearch: true,
    sync: planId !== "free",
  };
}

export function parseExternalReference(ref: string | null | undefined): Record<string, string> | null {
  if (!ref?.trim()) return null;
  const raw = ref.trim();
  if (raw.startsWith("luna:")) {
    const parts = raw.split(":");
    if (parts.length >= 3 && parts[1] && parts[2] === "credit_pack") {
      return { uid: parts[1]!, kind: "credit_pack" };
    }
    if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
      return { uid: parts[1]!, planId: parts[2]!, period: parts[3]! };
    }
    if (parts.length === 2 && parts[1]) return { uid: parts[1]! };
  }
  if (raw.length >= 20 && !raw.includes(" ") && !raw.includes(":")) {
    return { uid: raw };
  }
  return null;
}

export function isCreditPackReference(ref: string | null | undefined): boolean {
  const parsed = parseExternalReference(ref);
  return parsed?.kind === "credit_pack";
}

export function isLunaBillingCharge(
  payment: Record<string, unknown>,
  subscription?: Record<string, unknown> | null,
): boolean {
  for (const source of [payment, subscription ?? {}]) {
    const ref = String(source.externalReference ?? "").trim();
    if (ref.startsWith("luna:")) return true;
    const desc = String(source.description ?? "").toLowerCase();
    if (desc.includes("luna plus") || desc.includes("luna pro") || desc.includes("luna byok")) {
      return true;
    }
    if (ref.includes("credit_pack") || (desc.includes("pack") && desc.includes("crédit"))) {
      return true;
    }
  }
  return false;
}

export function resolvePlanFromPayment(
  payment: Record<string, unknown>,
  subscription?: Record<string, unknown> | null,
): { planId: PlanId | null; period: BillingPeriod | null } {
  for (const source of [payment, subscription ?? {}]) {
    const ref = parseExternalReference(String(source.externalReference ?? "") || null);
    if (ref?.planId === "plus" || ref?.planId === "pro" || ref?.planId === "byok") {
      return {
        planId: ref.planId as PlanId,
        period: ref.period === "annual" ? "annual" : "monthly",
      };
    }
  }

  const text = [payment.description, subscription?.description]
    .map((x) => String(x ?? "").toLowerCase())
    .join(" ");
  if (text.includes("byok")) return { planId: "byok", period: periodFromText(text) };
  if (text.includes(" pro") || text.startsWith("pro") || text.includes("luna pro")) {
    return { planId: "pro", period: periodFromText(text) };
  }
  if (text.includes("plus") || text.includes("luna plus")) {
    return { planId: "plus", period: periodFromText(text) };
  }

  const value = coerceValue(payment.value) ?? coerceValue(subscription?.value);
  if (value != null) {
    for (const [key, meta] of Object.entries(PLAN_CATALOG)) {
      if (Math.abs(meta.value - value) < 0.02) {
        const [planId, period] = key.split("-") as [PlanId, BillingPeriod];
        return { planId, period };
      }
    }
  }
  return { planId: null, period: null };
}

function periodFromText(text: string): BillingPeriod {
  return text.includes("anual") || text.includes("annual") || text.includes("year")
    ? "annual"
    : "monthly";
}

function coerceValue(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
