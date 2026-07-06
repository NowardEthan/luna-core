import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  computeWindowResetsAt,
  currentMonthKey,
  formatResetPrecise,
  FREE_QUOTA_WINDOW_MS,
  FREE_USAGE_DOC_ID,
  hoursUntilReset,
  limitsForPlan,
  QUOTA_KIND_LABELS,
  usesRollingWindow,
  type QuotaKind,
} from "./planQuotas.js";
import { requireFirestore } from "./planUpdater.js";
import type { PlanId } from "./planMapping.js";
import { isValidPlanId } from "./planMapping.js";

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded" as const;
  readonly kind: QuotaKind;
  readonly used: number;
  readonly limit: number;
  readonly resetsAtMs: number;

  constructor(kind: QuotaKind, used: number, limit: number, resetsAtMs: number, planId: PlanId) {
    const nowMs = Date.now();
    const msUntilReset = Math.max(0, resetsAtMs - nowMs);
    const cycle = usesRollingWindow(planId)
      ? `a cada ${FREE_QUOTA_WINDOW_MS / 3_600_000} h`
      : "este mês";
    const resetHint = usesRollingWindow(planId)
      ? ` Renova ${formatResetPrecise(msUntilReset)}.`
      : " Renova no próximo mês ou faça upgrade.";
    super(
      `Limite de ${QUOTA_KIND_LABELS[kind].toLowerCase()} (${used}/${limit} ${cycle}).${resetHint}`,
    );
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.used = used;
    this.limit = limit;
    this.resetsAtMs = resetsAtMs;
  }
}

function parsePlanId(raw: unknown): PlanId {
  if (typeof raw === "string" && isValidPlanId(raw)) return raw;
  return "free";
}

export async function getUserPlanId(uid: string): Promise<PlanId> {
  const db = requireFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  return parsePlanId(userSnap.data()?.plan);
}

function coerceTimestampMs(raw: unknown, fallback: number): number {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export type QuotaUsageSnapshot = {
  planId: PlanId;
  cycle: "window" | "monthly" | "unlimited";
  windowHours: number | null;
  periodKey: string;
  used: Record<QuotaKind, number>;
  limits: Record<QuotaKind, number | null>;
  remaining: Record<QuotaKind, number | null>;
  bonusTurns: number;
  resetsAtMs: number | null;
};

function emptyUsed(): Record<QuotaKind, number> {
  return { messages: 0, images: 0, documents: 0, voice: 0 };
}

function buildSnapshot(
  planId: PlanId,
  used: Record<QuotaKind, number>,
  bonusTurns: number,
  periodKey: string,
  resetsAtMs: number | null,
): QuotaUsageSnapshot {
  const baseLimits = limitsForPlan(planId);
  const limits: Record<QuotaKind, number | null> = { ...baseLimits };
  if (!usesRollingWindow(planId) && limits.messages !== null) {
    limits.messages = limits.messages + bonusTurns;
  }

  const remaining: Record<QuotaKind, number | null> = {
    messages: null,
    images: null,
    documents: null,
    voice: null,
  };
  for (const kind of Object.keys(limits) as QuotaKind[]) {
    const limit = limits[kind];
    if (limit === null) continue;
    remaining[kind] = Math.max(0, limit - used[kind]);
  }

  const unlimited =
    Object.values(limits).every((v) => v === null) && !usesRollingWindow(planId);

  return {
    planId,
    cycle: usesRollingWindow(planId) ? "window" : unlimited ? "unlimited" : "monthly",
    windowHours: usesRollingWindow(planId) ? FREE_QUOTA_WINDOW_MS / 3_600_000 : null,
    periodKey,
    used,
    limits,
    remaining,
    bonusTurns,
    resetsAtMs,
  };
}

export async function getQuotaSnapshot(uid: string): Promise<QuotaUsageSnapshot> {
  const db = requireFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const planId = parsePlanId(userSnap.data()?.plan);
  console.log(`[quotaService] getQuotaSnapshot uid=${uid} planId=${planId}`);
  const now = Date.now();

  if (usesRollingWindow(planId)) {
    const usageSnap = await db.doc(`users/${uid}/usage/${FREE_USAGE_DOC_ID}`).get();
    const data = usageSnap.data();
    const storedStart = coerceTimestampMs(data?.windowStart, now);
    let windowStart = storedStart;
    let used: Record<QuotaKind, number> = {
      messages: typeof data?.messages === "number" ? data.messages : 0,
      images: typeof data?.images === "number" ? data.images : 0,
      documents: typeof data?.documents === "number" ? data.documents : 0,
      voice: typeof data?.voice === "number" ? data.voice : 0,
    };
    if (now - storedStart >= FREE_QUOTA_WINDOW_MS) {
      windowStart = now;
      used = emptyUsed();
    }
    return buildSnapshot(
      planId,
      used,
      0,
      FREE_USAGE_DOC_ID,
      computeWindowResetsAt(windowStart),
    );
  }

  const monthKey = currentMonthKey();
  const usageSnap = await db.doc(`users/${uid}/usage/${monthKey}`).get();
  const data = usageSnap.data();
  const turns = typeof data?.turns === "number" ? data.turns : 0;
  const bonusTurns = typeof data?.bonusTurns === "number" ? data.bonusTurns : 0;
  console.log(`[quotaService] getQuotaSnapshot monthly uid=${uid} monthKey=${monthKey} turns=${turns} bonusTurns=${bonusTurns}`);
  const used = emptyUsed();
  used.messages = turns;

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);

  return buildSnapshot(planId, used, bonusTurns, monthKey, nextMonth.getTime());
}

export async function consumeQuota(
  uid: string,
  kind: QuotaKind,
  amount = 1,
): Promise<QuotaUsageSnapshot> {
  if (amount < 1) amount = 1;

  const db = requireFirestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const planId = parsePlanId(userSnap.data()?.plan);
    const planLimits = limitsForPlan(planId);
    const now = Date.now();

    if (Object.values(planLimits).every((v) => v === null) && !usesRollingWindow(planId)) {
      return buildSnapshot(planId, emptyUsed(), 0, currentMonthKey(), null);
    }

    if (!usesRollingWindow(planId)) {
      if (kind !== "messages") {
        return buildSnapshot(planId, emptyUsed(), 0, currentMonthKey(), null);
      }

      const monthKey = currentMonthKey();
      const usageRef = db.doc(`users/${uid}/usage/${monthKey}`);
      const usageSnap = await tx.get(usageRef);
      const data = usageSnap.data();
      const used = typeof data?.turns === "number" ? data.turns : 0;
      const bonusTurns = typeof data?.bonusTurns === "number" ? data.bonusTurns : 0;
      const limit = planLimits.messages;
      console.log(`[quotaService] consumeQuota monthly uid=${uid} monthKey=${monthKey} planId=${planId} before=${used} amount=${amount} limit=${limit} bonusTurns=${bonusTurns}`);
      if (limit === null) {
        return buildSnapshot(planId, { ...emptyUsed(), messages: used }, bonusTurns, monthKey, null);
      }
      const effectiveLimit = limit + bonusTurns;
      if (used + amount > effectiveLimit) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
        nextMonth.setHours(0, 0, 0, 0);
        throw new QuotaExceededError(kind, used, effectiveLimit, nextMonth.getTime(), planId);
      }

      tx.set(
        usageRef,
        { turns: used + amount, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      console.log(`[quotaService] consumeQuota monthly uid=${uid} monthKey=${monthKey} after=${used + amount}`);

      const usedMap = emptyUsed();
      usedMap.messages = used + amount;
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      nextMonth.setHours(0, 0, 0, 0);
      return buildSnapshot(planId, usedMap, bonusTurns, monthKey, nextMonth.getTime());
    }

    const usageRef = db.doc(`users/${uid}/usage/${FREE_USAGE_DOC_ID}`);
    const usageSnap = await tx.get(usageRef);
    const data = usageSnap.data() ?? {};
    let windowStart = coerceTimestampMs(data.windowStart, now);

    let used: Record<QuotaKind, number> = {
      messages: typeof data.messages === "number" ? data.messages : 0,
      images: typeof data.images === "number" ? data.images : 0,
      documents: typeof data.documents === "number" ? data.documents : 0,
      voice: typeof data.voice === "number" ? data.voice : 0,
    };

    if (now - windowStart >= FREE_QUOTA_WINDOW_MS) {
      windowStart = now;
      used = emptyUsed();
    }

    const limit = planLimits[kind];
    if (limit === null) {
      return buildSnapshot(
        planId,
        used,
        0,
        FREE_USAGE_DOC_ID,
        computeWindowResetsAt(windowStart),
      );
    }

    if (used[kind] + amount > limit) {
      throw new QuotaExceededError(
        kind,
        used[kind],
        limit,
        computeWindowResetsAt(windowStart),
        planId,
      );
    }

    used[kind] += amount;

    tx.set(
      usageRef,
      {
        ...used,
        windowStart: Timestamp.fromMillis(windowStart),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return buildSnapshot(
      planId,
      used,
      0,
      FREE_USAGE_DOC_ID,
      computeWindowResetsAt(windowStart),
    );
  });
}

export async function consumeCloudTurn(uid: string): Promise<QuotaUsageSnapshot> {
  return consumeQuota(uid, "messages", 1);
}

export type TurnQuotaSnapshot = QuotaUsageSnapshot;
