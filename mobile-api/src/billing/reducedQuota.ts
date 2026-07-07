import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireFirestore } from "./planUpdater.js";
import { formatResetPrecise } from "./planQuotas.js";

/** Limites do tier Free Trial Cerebras (fallback quando quota do plano esgota). */
export const CEREBRAS_FREE_USAGE_DOC_ID = "_cerebras_free";
export const CEREBRAS_FREE_RATE_DOC_ID = "_cerebras_rate";

export const CEREBRAS_FREE_DAILY_TOKENS = 1_000_000;
export const CEREBRAS_FREE_DAILY_MS = 24 * 60 * 60 * 1000;
export const CEREBRAS_FREE_REQUESTS_PER_MIN = 5;
export const CEREBRAS_FREE_INPUT_TOKENS_PER_MIN = 30_000;
export const CEREBRAS_FREE_MINUTE_MS = 60_000;

export type ReducedModeSnapshot = {
  available: boolean;
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  resetsAtMs: number;
  requestsPerMinute: number;
  inputTokensPerMinute: number;
};

export class ReducedQuotaExceededError extends Error {
  readonly code = "reduced_quota_exceeded" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReducedQuotaExceededError";
  }
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

function readDailyUsage(
  data: Record<string, unknown> | undefined,
  now: number,
): { tokens: number; dayStart: number } {
  const storedStart = coerceTimestampMs(data?.dayStart, now);
  if (now - storedStart >= CEREBRAS_FREE_DAILY_MS) {
    return { tokens: 0, dayStart: now };
  }
  return {
    tokens: typeof data?.tokens === "number" ? data.tokens : 0,
    dayStart: storedStart,
  };
}

function readMinuteRate(
  data: Record<string, unknown> | undefined,
  now: number,
): { requests: number; inputTokens: number; minuteStart: number } {
  const storedStart = coerceTimestampMs(data?.minuteStart, now);
  if (now - storedStart >= CEREBRAS_FREE_MINUTE_MS) {
    return { requests: 0, inputTokens: 0, minuteStart: now };
  }
  return {
    requests: typeof data?.requests === "number" ? data.requests : 0,
    inputTokens: typeof data?.inputTokens === "number" ? data.inputTokens : 0,
    minuteStart: storedStart,
  };
}

export function buildReducedModeSnapshot(
  dailyUsed: number,
  dayStart: number,
): ReducedModeSnapshot {
  const resetsAtMs = dayStart + CEREBRAS_FREE_DAILY_MS;
  const dailyRemaining = Math.max(0, CEREBRAS_FREE_DAILY_TOKENS - dailyUsed);
  return {
    available: dailyRemaining > 0,
    dailyUsed,
    dailyLimit: CEREBRAS_FREE_DAILY_TOKENS,
    dailyRemaining,
    resetsAtMs,
    requestsPerMinute: CEREBRAS_FREE_REQUESTS_PER_MIN,
    inputTokensPerMinute: CEREBRAS_FREE_INPUT_TOKENS_PER_MIN,
  };
}

export async function getReducedModeSnapshot(uid: string): Promise<ReducedModeSnapshot> {
  const db = requireFirestore();
  const now = Date.now();
  const snap = await db.doc(`users/${uid}/usage/${CEREBRAS_FREE_USAGE_DOC_ID}`).get();
  const daily = readDailyUsage(snap.data(), now);
  return buildReducedModeSnapshot(daily.tokens, daily.dayStart);
}

/** Verifica limites do tier free Cerebras (sem consumir). */
export async function assertReducedTierAvailable(
  uid: string,
  estimatedInputTokens: number,
): Promise<void> {
  const db = requireFirestore();
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const dailyRef = db.doc(`users/${uid}/usage/${CEREBRAS_FREE_USAGE_DOC_ID}`);
    const rateRef = db.doc(`users/${uid}/usage/${CEREBRAS_FREE_RATE_DOC_ID}`);
    const dailySnap = await tx.get(dailyRef);
    const rateSnap = await tx.get(rateRef);

    const daily = readDailyUsage(dailySnap.data(), now);
    const rate = readMinuteRate(rateSnap.data(), now);

    if (daily.tokens >= CEREBRAS_FREE_DAILY_TOKENS) {
      const resetsAt = daily.dayStart + CEREBRAS_FREE_DAILY_MS;
      throw new ReducedQuotaExceededError(
        `Modo reduzido esgotado hoje (${daily.tokens.toLocaleString("pt-BR")}/${CEREBRAS_FREE_DAILY_TOKENS.toLocaleString("pt-BR")} tokens). Renova ${formatResetPrecise(resetsAt - now)}.`,
      );
    }

    if (rate.requests >= CEREBRAS_FREE_REQUESTS_PER_MIN) {
      throw new ReducedQuotaExceededError(
        `Modo reduzido: aguarde um momento (máx. ${CEREBRAS_FREE_REQUESTS_PER_MIN} pedidos por minuto).`,
      );
    }

    if (rate.inputTokens + estimatedInputTokens > CEREBRAS_FREE_INPUT_TOKENS_PER_MIN) {
      throw new ReducedQuotaExceededError(
        `Modo reduzido: muitos tokens neste minuto (máx. ${(CEREBRAS_FREE_INPUT_TOKENS_PER_MIN / 1000).toFixed(0)} mil input/min).`,
      );
    }
  });
}

/** Consome tokens do tier free Cerebras após pedido bem-sucedido. */
export async function consumeReducedTokens(
  uid: string,
  apiTokens: number,
  inputTokens: number,
): Promise<ReducedModeSnapshot> {
  if (apiTokens < 1) apiTokens = 1;

  const db = requireFirestore();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const dailyRef = db.doc(`users/${uid}/usage/${CEREBRAS_FREE_USAGE_DOC_ID}`);
    const rateRef = db.doc(`users/${uid}/usage/${CEREBRAS_FREE_RATE_DOC_ID}`);
    const dailySnap = await tx.get(dailyRef);
    const rateSnap = await tx.get(rateRef);

    const daily = readDailyUsage(dailySnap.data(), now);
    const rate = readMinuteRate(rateSnap.data(), now);

    if (daily.tokens + apiTokens > CEREBRAS_FREE_DAILY_TOKENS) {
      throw new ReducedQuotaExceededError("Modo reduzido: limite diário atingido.");
    }
    if (rate.requests + 1 > CEREBRAS_FREE_REQUESTS_PER_MIN) {
      throw new ReducedQuotaExceededError("Modo reduzido: limite por minuto atingido.");
    }

    const newDaily = daily.tokens + apiTokens;
    const newRequests = rate.requests + 1;
    const newInput = rate.inputTokens + inputTokens;

    tx.set(
      dailyRef,
      {
        tokens: newDaily,
        dayStart: Timestamp.fromMillis(daily.dayStart),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      rateRef,
      {
        requests: newRequests,
        inputTokens: newInput,
        minuteStart: Timestamp.fromMillis(rate.minuteStart),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return buildReducedModeSnapshot(newDaily, daily.dayStart);
  });
}
