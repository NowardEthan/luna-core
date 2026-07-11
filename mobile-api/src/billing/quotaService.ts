import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  computeWindowResetsAt,
  computeWeeklyResetsAt,
  currentMonthKey,
  formatResetPrecise,
  FREE_QUOTA_WINDOW_MS,
  FREE_USAGE_DOC_ID,
  usesRollingWindow,
  WEEKLY_QUOTA_WINDOW_MS,
  WEEKLY_USAGE_DOC_ID,
  weeklyTokenLimitForPlan,
  windowTokenLimitForPlan,
} from "./planQuotas.js";
import { requireFirestore } from "./planUpdater.js";
import type { PlanId } from "./planMapping.js";
import { isValidPlanId } from "./planMapping.js";
import { isCerebrasReducedFallbackEnabled } from "../llmProviders.js";
import {
  assertReducedTierAvailable,
  getReducedModeSnapshot,
  ReducedQuotaExceededError,
  type ReducedModeSnapshot,
} from "./reducedQuota.js";
import { migrarContadoresLegados, CUSTO_MINIMO_CHAT } from "./tokenEstimate.js";
import { ehCriadorVerificado } from "../criadorVerificado.js";

export class QuotaExceededError extends Error {
  readonly code = "quota_exceeded" as const;
  readonly kind = "tokens" as const;
  readonly used: number;
  readonly limit: number;
  readonly resetsAtMs: number;
  readonly cycle: "window" | "weekly";

  constructor(
    used: number,
    limit: number,
    resetsAtMs: number,
    planId: PlanId,
    cycle: "window" | "weekly",
  ) {
    const msUntilReset = Math.max(0, resetsAtMs - Date.now());
    const cycleLabel = cycle === "weekly" ? "esta semana" : `a cada ${FREE_QUOTA_WINDOW_MS / 3_600_000} h`;
    super(
      `Limite de tokens (${used.toLocaleString("pt-BR")}/${limit.toLocaleString("pt-BR")} ${cycleLabel}). Renova ${formatResetPrecise(msUntilReset)}.`,
    );
    this.name = "QuotaExceededError";
    this.used = used;
    this.limit = limit;
    this.resetsAtMs = resetsAtMs;
    this.cycle = cycle;
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

export type WeeklyTokensSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  resetsAtMs: number;
};

export type QuotaUsageSnapshot = {
  planId: PlanId;
  cycle: "window" | "monthly" | "unlimited";
  bindingCycle?: "window" | "weekly" | "monthly";
  windowHours: number | null;
  periodKey: string;
  usedTokens: number;
  windowTokenLimit: number | null;
  remainingTokens: number | null;
  bonusTurns: number;
  resetsAtMs: number | null;
  weeklyTokens?: WeeklyTokensSnapshot | null;
  /** Fallback Cerebras free quando a quota do plano esgota. */
  reducedMode?: ReducedModeSnapshot | null;
};

export type QuotaRequestMode = "plan" | "reduced";

function readWindowTokens(
  data: Record<string, unknown> | undefined,
  now: number,
): { tokens: number; windowStart: number } {
  const storedStart = coerceTimestampMs(data?.windowStart, now);
  if (now - storedStart >= FREE_QUOTA_WINDOW_MS) {
    return { tokens: 0, windowStart: now };
  }
  return {
    tokens: migrarContadoresLegados(data),
    windowStart: storedStart,
  };
}

function readWeeklyTokens(
  data: Record<string, unknown> | undefined,
  now: number,
): { tokens: number; weekStart: number } {
  const storedStart = coerceTimestampMs(data?.weekStart, now);
  if (now - storedStart >= WEEKLY_QUOTA_WINDOW_MS) {
    return { tokens: 0, weekStart: now };
  }
  if (typeof data?.tokens === "number") {
    return { tokens: data.tokens, weekStart: storedStart };
  }
  const messages = typeof data?.messages === "number" ? data.messages : 0;
  return { tokens: messages * 12_500, weekStart: storedStart };
}

function buildTokenSnapshot(
  planId: PlanId,
  windowTokens: number,
  windowStart: number,
  weeklyTokens: number,
  weekStart: number,
  bonusTurns: number,
  periodKey: string,
): QuotaUsageSnapshot {
  if (!usesRollingWindow(planId)) {
    return {
      planId,
      cycle: "unlimited",
      windowHours: null,
      periodKey,
      usedTokens: 0,
      windowTokenLimit: null,
      remainingTokens: null,
      bonusTurns,
      resetsAtMs: null,
      weeklyTokens: null,
      bindingCycle: "monthly",
    };
  }

  const windowLimit = windowTokenLimitForPlan(planId)!;
  const weeklyLimit = weeklyTokenLimitForPlan(planId)!;
  const windowResetsAt = computeWindowResetsAt(windowStart);
  const weeklyResetsAt = computeWeeklyResetsAt(weekStart);
  const windowRemaining = Math.max(0, windowLimit - windowTokens);
  const weeklyRemaining = Math.max(0, weeklyLimit - weeklyTokens);
  const weeklyBinds = weeklyRemaining < windowRemaining;

  return {
    planId,
    cycle: "window",
    bindingCycle: weeklyBinds ? "weekly" : "window",
    windowHours: FREE_QUOTA_WINDOW_MS / 3_600_000,
    periodKey,
    usedTokens: weeklyBinds ? weeklyTokens : windowTokens,
    windowTokenLimit: windowLimit,
    remainingTokens: Math.min(windowRemaining, weeklyRemaining),
    bonusTurns: 0,
    resetsAtMs: weeklyBinds ? weeklyResetsAt : windowResetsAt,
    weeklyTokens: {
      used: weeklyTokens,
      limit: weeklyLimit,
      remaining: weeklyRemaining,
      resetsAtMs: weeklyResetsAt,
    },
  };
}

async function attachReducedMode(
  uid: string,
  snapshot: QuotaUsageSnapshot,
): Promise<QuotaUsageSnapshot> {
  if (!usesRollingWindow(snapshot.planId) || !isCerebrasReducedFallbackEnabled()) {
    return snapshot;
  }

  const reduced = await getReducedModeSnapshot(uid);
  const planDepleted = (snapshot.remainingTokens ?? 0) < CUSTO_MINIMO_CHAT;

  return {
    ...snapshot,
    reducedMode: {
      ...reduced,
      available: planDepleted && reduced.dailyRemaining > 0,
    },
  };
}

export async function getQuotaSnapshot(uid: string): Promise<QuotaUsageSnapshot> {
  const db = requireFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const planId = parsePlanId(userSnap.data()?.plan);
  const now = Date.now();

  if (usesRollingWindow(planId)) {
    const usageSnap = await db.doc(`users/${uid}/usage/${FREE_USAGE_DOC_ID}`).get();
    const window = readWindowTokens(usageSnap.data(), now);
    const weeklySnap = await db.doc(`users/${uid}/usage/${WEEKLY_USAGE_DOC_ID}`).get();
    const weekly = readWeeklyTokens(weeklySnap.data(), now);
    const snapshot = buildTokenSnapshot(
      planId,
      window.tokens,
      window.windowStart,
      weekly.tokens,
      weekly.weekStart,
      0,
      FREE_USAGE_DOC_ID,
    );
    if (ehCriadorVerificado(uid)) {
      // Criador ilimitado: mantém a contagem REAL (usedTokens continua contando),
      // mas sem teto (windowTokenLimit/remaining = null). O app usa
      // `windowTokenLimit !== null` para decidir se há limite → trata como
      // ilimitado, não mostra UI de limite nem desabilita o composer.
      return { ...snapshot, windowTokenLimit: null, remainingTokens: null, weeklyTokens: null, reducedMode: null };
    }
    return attachReducedMode(uid, snapshot);
  }

  const monthKey = currentMonthKey();
  const usageSnap = await db.doc(`users/${uid}/usage/${monthKey}`).get();
  const data = usageSnap.data();
  const bonusTurns = typeof data?.bonusTurns === "number" ? data.bonusTurns : 0;

  return buildTokenSnapshot(planId, 0, now, 0, now, bonusTurns, monthKey);
}

/** Verifica se há tokens suficientes sem consumir. */
export async function assertTokensAvailable(uid: string, amount: number): Promise<void> {
  if (amount < 1) return;

  // Criador = limite ilimitado: nunca bloqueado. O consumo ainda é contado
  // (ver consumeTokens), só não há teto para o barrar.
  if (ehCriadorVerificado(uid)) return;

  const db = requireFirestore();
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const planId = parsePlanId(userSnap.data()?.plan);
    if (!usesRollingWindow(planId)) return;

    const now = Date.now();
    const windowLimit = windowTokenLimitForPlan(planId)!;
    const weeklyLimit = weeklyTokenLimitForPlan(planId)!;

    const usageSnap = await tx.get(db.doc(`users/${uid}/usage/${FREE_USAGE_DOC_ID}`));
    const window = readWindowTokens(usageSnap.data(), now);

    if (window.tokens + amount > windowLimit) {
      throw new QuotaExceededError(
        window.tokens,
        windowLimit,
        computeWindowResetsAt(window.windowStart),
        planId,
        "window",
      );
    }

    const weeklySnap = await tx.get(db.doc(`users/${uid}/usage/${WEEKLY_USAGE_DOC_ID}`));
    const weekly = readWeeklyTokens(weeklySnap.data(), now);

    if (weekly.tokens + amount > weeklyLimit) {
      throw new QuotaExceededError(
        weekly.tokens,
        weeklyLimit,
        computeWeeklyResetsAt(weekly.weekStart),
        planId,
        "weekly",
      );
    }
  });
}

/**
 * Resolve se o pedido usa quota do plano ou modo reduzido Cerebras (free).
 * Devolve erro só quando ambos estão indisponíveis.
 */
export async function resolveQuotaForRequest(
  uid: string,
  billingTokens: number,
  estimatedInputTokens: number,
): Promise<{ mode: QuotaRequestMode }> {
  try {
    await assertTokensAvailable(uid, billingTokens);
    return { mode: "plan" };
  } catch (planErr) {
    if (!(planErr instanceof QuotaExceededError)) throw planErr;
    if (!isCerebrasReducedFallbackEnabled()) throw planErr;

    try {
      await assertReducedTierAvailable(uid, estimatedInputTokens);
      return { mode: "reduced" };
    } catch (reducedErr) {
      if (reducedErr instanceof ReducedQuotaExceededError) throw reducedErr;
      throw planErr;
    }
  }
}

/** Consome tokens após operação bem-sucedida. */
export async function consumeTokens(uid: string, amount: number): Promise<QuotaUsageSnapshot> {
  if (amount < 1) amount = 1;

  // Criador: conta os tokens normalmente (incrementa os contadores abaixo), mas
  // NUNCA é barrado por teto — os throws de limite são pulados só para ele.
  const criador = ehCriadorVerificado(uid);

  const db = requireFirestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const planId = parsePlanId(userSnap.data()?.plan);
    const now = Date.now();

    if (!usesRollingWindow(planId)) {
      const monthKey = currentMonthKey();
      const monthSnap = await tx.get(db.doc(`users/${uid}/usage/${monthKey}`));
      const bonusTurns =
        typeof monthSnap.data()?.bonusTurns === "number" ? monthSnap.data()!.bonusTurns : 0;
      return buildTokenSnapshot(planId, 0, now, 0, now, bonusTurns, monthKey);
    }

    const windowLimit = windowTokenLimitForPlan(planId)!;
    const weeklyLimit = weeklyTokenLimitForPlan(planId)!;

    const usageRef = db.doc(`users/${uid}/usage/${FREE_USAGE_DOC_ID}`);
    const usageSnap = await tx.get(usageRef);
    const window = readWindowTokens(usageSnap.data(), now);

    if (!criador && window.tokens + amount > windowLimit) {
      throw new QuotaExceededError(
        window.tokens,
        windowLimit,
        computeWindowResetsAt(window.windowStart),
        planId,
        "window",
      );
    }

    const weeklyRef = db.doc(`users/${uid}/usage/${WEEKLY_USAGE_DOC_ID}`);
    const weeklySnap = await tx.get(weeklyRef);
    const weekly = readWeeklyTokens(weeklySnap.data(), now);

    if (!criador && weekly.tokens + amount > weeklyLimit) {
      throw new QuotaExceededError(
        weekly.tokens,
        weeklyLimit,
        computeWeeklyResetsAt(weekly.weekStart),
        planId,
        "weekly",
      );
    }

    const newWindowTokens = window.tokens + amount;
    const newWeeklyTokens = weekly.tokens + amount;

    tx.set(
      usageRef,
      {
        tokens: newWindowTokens,
        windowStart: Timestamp.fromMillis(window.windowStart),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      weeklyRef,
      {
        tokens: newWeeklyTokens,
        weekStart: Timestamp.fromMillis(weekly.weekStart),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return buildTokenSnapshot(
      planId,
      newWindowTokens,
      window.windowStart,
      newWeeklyTokens,
      weekly.weekStart,
      0,
      FREE_USAGE_DOC_ID,
    );
  });
}

/** @deprecated Usar consumeTokens — mantido para compat. */
export async function consumeQuota(
  uid: string,
  _kind: string,
  amount = 1,
): Promise<QuotaUsageSnapshot> {
  return consumeTokens(uid, amount);
}

/** @deprecated Usar consumeTokens. */
export async function consumeCloudTurn(uid: string): Promise<QuotaUsageSnapshot> {
  return consumeTokens(uid, CUSTO_MINIMO_CHAT);
}

export type TurnQuotaSnapshot = QuotaUsageSnapshot;
