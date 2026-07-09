import {
  computeWeeklyResetsAt,
  usesRollingWindow,
  WEEKLY_QUOTA_WINDOW_MS,
  weeklyTokenLimitForPlan,
} from './planQuotas';
import { migrarContadoresLegados } from './tokenEstimate';
import type { LunaPlanId } from './types';

export type WeeklyTokensSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  resetsAtMs: number;
};

export type MergedTokenQuota = {
  remaining: number | null;
  resetsAtMs: number | null;
  bindingCycle: 'window' | 'weekly';
  weeklyTokens: WeeklyTokensSnapshot | null;
};

/** Converte timestamp Firestore / número / ISO para ms. */
export function coerceQuotaTimestamp(raw: unknown, fallback: number): number {
  if (raw && typeof raw === 'object' && 'toMillis' in raw) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Lê tokens semanais com expiração da janela de 7 dias. */
export function readWeeklyTokens(
  data: Record<string, unknown> | undefined,
  nowMs: number,
): { used: number; weekStart: number } {
  const storedStart = coerceQuotaTimestamp(data?.weekStart, nowMs);
  if (nowMs - storedStart >= WEEKLY_QUOTA_WINDOW_MS) {
    return { used: 0, weekStart: nowMs };
  }
  if (typeof data?.tokens === 'number') {
    return { used: data.tokens, weekStart: storedStart };
  }
  const messages = typeof data?.messages === 'number' ? data.messages : 0;
  return { used: messages * 12_500, weekStart: storedStart };
}

/**
 * Combina restantes da janela rolante com o teto semanal de tokens.
 * remaining = min(janela, semana); bindingCycle indica qual limita agora.
 */
export function mergeWeeklyTokenQuota(
  planId: LunaPlanId,
  windowRemaining: number | null,
  windowResetsAt: number | null,
  weeklyUsed: number,
  weekStart: number,
  pendingWeekly: number,
): MergedTokenQuota {
  const weeklyLimit = weeklyTokenLimitForPlan(planId);
  if (weeklyLimit === null || !usesRollingWindow(planId)) {
    return {
      remaining: windowRemaining,
      resetsAtMs: windowResetsAt,
      bindingCycle: 'window',
      weeklyTokens: null,
    };
  }

  const effectiveWeeklyUsed = Math.min(weeklyLimit, weeklyUsed + pendingWeekly);
  const weeklyResetsAt = computeWeeklyResetsAt(weekStart);
  const weeklyRemaining = Math.max(0, weeklyLimit - effectiveWeeklyUsed);
  const safeWindowRemaining = windowRemaining ?? weeklyRemaining;
  const weeklyBinds = weeklyRemaining < safeWindowRemaining;

  return {
    remaining: Math.min(safeWindowRemaining, weeklyRemaining),
    resetsAtMs: weeklyBinds ? weeklyResetsAt : windowResetsAt,
    bindingCycle: weeklyBinds ? 'weekly' : 'window',
    weeklyTokens: {
      used: effectiveWeeklyUsed,
      limit: weeklyLimit,
      remaining: weeklyRemaining,
      resetsAtMs: weeklyResetsAt,
    },
  };
}

/** Lê tokens da janela com migração de contadores legados. */
export function readWindowTokens(
  data: Record<string, unknown> | undefined,
  nowMs: number,
  windowMs: number,
): { used: number; windowStart: number } {
  const storedStart = coerceQuotaTimestamp(data?.windowStart, nowMs);
  if (nowMs - storedStart >= windowMs) {
    return { used: 0, windowStart: nowMs };
  }
  return {
    used: migrarContadoresLegados(data),
    windowStart: storedStart,
  };
}

/** Próximo reset (ms) — menor entre janela e semana quando ambos aplicam. */
export function nextQuotaResetMs(
  windowResetsAt: number | null,
  weeklyResetsAt: number | null,
  nowMs = Date.now(),
): number | null {
  const candidates = [windowResetsAt, weeklyResetsAt].filter(
    (t): t is number => t != null && t > nowMs,
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}
