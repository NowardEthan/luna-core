import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';

import { getLunaFirestore } from '../../lib/firebase/client';
import { userUsageDoc } from '../../lib/firebase/paths';
import {
  computeWindowResetsAt,
  currentMonthKey,
  FREE_QUOTA_WINDOW_MS,
  FREE_USAGE_DOC_ID,
  getDaysUntilQuotaReset,
  hoursUntilReset,
  limitsForPlan,
  usesRollingWindow,
  type QuotaKind,
} from './planQuotas';
import type { LunaPlanId } from './types';

export type { QuotaKind };

export type LunaUsageSnapshot = {
  planId: LunaPlanId;
  cycle: 'window' | 'monthly' | 'unlimited';
  windowHours: number | null;
  periodKey: string;
  used: Record<QuotaKind, number>;
  limits: Record<QuotaKind, number | null>;
  remaining: Record<QuotaKind, number | null>;
  bonusTurns: number;
  resetsAtMs: number | null;
  resetHours: number | null;
  resetDays: number | null;
  /** Compat — barra principal (mensagens). */
  usedMessages: number;
  effectiveLimit: number | null;
  pct: number;
  loading: boolean;
};

function emptyUsed(): Record<QuotaKind, number> {
  return { messages: 0, images: 0, documents: 0, voice: 0 };
}

function coerceWindowStart(raw: unknown, fallback: number): number {
  if (raw && typeof raw === 'object' && 'toMillis' in raw) {
    return (raw as Timestamp).toMillis();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseUsageDoc(
  planId: LunaPlanId,
  data: Record<string, unknown> | undefined,
  bonusTurns: number,
): Pick<LunaUsageSnapshot, 'used' | 'resetsAtMs' | 'resetHours' | 'resetDays'> {
  const now = Date.now();
  const limits = limitsForPlan(planId);

  if (usesRollingWindow(planId)) {
    const storedStart = coerceWindowStart(data?.windowStart, now);
    let windowStart = storedStart;
    let used = emptyUsed();
    if (now - storedStart < FREE_QUOTA_WINDOW_MS && data) {
      used = {
        messages: typeof data.messages === 'number' ? data.messages : 0,
        images: typeof data.images === 'number' ? data.images : 0,
        documents: typeof data.documents === 'number' ? data.documents : 0,
        voice: typeof data.voice === 'number' ? data.voice : 0,
      };
    } else {
      windowStart = now;
    }
    const resetsAtMs = computeWindowResetsAt(windowStart);
    return {
      used,
      resetsAtMs,
      resetHours: hoursUntilReset(resetsAtMs, now),
      resetDays: null,
    };
  }

  const used = emptyUsed();
  used.messages = typeof data?.turns === 'number' ? data.turns : 0;
  const msgLimit = limits.messages;
  const effective = msgLimit !== null ? msgLimit + bonusTurns : null;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);

  return {
    used,
    resetsAtMs: effective !== null ? nextMonth.getTime() : null,
    resetHours: null,
    resetDays: effective !== null ? getDaysUntilQuotaReset() : null,
  };
}

/** Lê uso na nuvem (janela rolante no Grátis · mensal nos pagos). */
export function useLunaUsage(planId: LunaPlanId, uid: string | null): LunaUsageSnapshot {
  const [rawUsed, setRawUsed] = useState<Record<QuotaKind, number>>(emptyUsed());
  const [bonusTurns, setBonusTurns] = useState(0);
  const [resetsAtMs, setResetsAtMs] = useState<number | null>(null);
  const [resetHours, setResetHours] = useState<number | null>(null);
  const [resetDays, setResetDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const periodKey = usesRollingWindow(planId) ? FREE_USAGE_DOC_ID : currentMonthKey();
  const baseLimits = limitsForPlan(planId);

  useEffect(() => {
    if (!uid) {
      setRawUsed(emptyUsed());
      setBonusTurns(0);
      setResetsAtMs(null);
      setResetHours(null);
      setResetDays(null);
      setLoading(false);
      return;
    }

    const db = getLunaFirestore();
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, userUsageDoc(uid, periodKey));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
        const bonus = usesRollingWindow(planId)
          ? 0
          : typeof data?.bonusTurns === 'number'
            ? data.bonusTurns
            : 0;
        setBonusTurns(bonus);
        const parsed = parseUsageDoc(planId, data, bonus);
        setRawUsed(parsed.used);
        setResetsAtMs(parsed.resetsAtMs);
        setResetHours(parsed.resetHours);
        setResetDays(parsed.resetDays);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [uid, periodKey, planId]);

  return useMemo((): LunaUsageSnapshot => {
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
      remaining[kind] = Math.max(0, limit - rawUsed[kind]);
    }

    const effectiveLimit = limits.messages;
    const usedMessages = rawUsed.messages;
    const pct =
      effectiveLimit !== null && effectiveLimit > 0
        ? Math.min(100, Math.floor((usedMessages / effectiveLimit) * 100))
        : 0;

    const unlimited =
      Object.values(limits).every((v) => v === null) && !usesRollingWindow(planId);

    return {
      planId,
      cycle: usesRollingWindow(planId) ? 'window' : unlimited ? 'unlimited' : 'monthly',
      windowHours: usesRollingWindow(planId) ? FREE_QUOTA_WINDOW_MS / 3_600_000 : null,
      periodKey,
      used: rawUsed,
      limits,
      remaining,
      bonusTurns,
      resetsAtMs,
      resetHours,
      resetDays,
      usedMessages,
      effectiveLimit,
      pct,
      loading,
    };
  }, [baseLimits, bonusTurns, periodKey, planId, rawUsed, resetDays, resetHours, resetsAtMs, loading]);
}
