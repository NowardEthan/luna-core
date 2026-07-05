import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { doc, getDocFromServer, onSnapshot, type Timestamp } from 'firebase/firestore';

import { lunaFetchUsage } from '../../data/lunaClient';
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

export type UseLunaUsageResult = LunaUsageSnapshot & {
  /** Actualiza o contador logo após consumo na API (antes do Firestore). */
  bumpUsage: (kind: QuotaKind, amount?: number) => void;
  /** Força leitura autoritativa no servidor. */
  refreshFromApi: (idToken: string) => Promise<void>;
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
  nowMs: number,
): Pick<LunaUsageSnapshot, 'used' | 'resetsAtMs' | 'resetHours' | 'resetDays'> {
  const limits = limitsForPlan(planId);

  if (usesRollingWindow(planId)) {
    const storedStart = coerceWindowStart(data?.windowStart, nowMs);
    let windowStart = storedStart;
    let used = emptyUsed();
    if (nowMs - storedStart < FREE_QUOTA_WINDOW_MS && data) {
      used = {
        messages: typeof data.messages === 'number' ? data.messages : 0,
        images: typeof data.images === 'number' ? data.images : 0,
        documents: typeof data.documents === 'number' ? data.documents : 0,
        voice: typeof data.voice === 'number' ? data.voice : 0,
      };
    } else {
      windowStart = nowMs;
    }
    const resetsAtMs = computeWindowResetsAt(windowStart, nowMs);
    return {
      used,
      resetsAtMs,
      resetHours: hoursUntilReset(resetsAtMs, nowMs),
      resetDays: null,
    };
  }

  const used = emptyUsed();
  used.messages = typeof data?.turns === 'number' ? data.turns : 0;
  const msgLimit = limits.messages;
  const effective = msgLimit !== null ? msgLimit + bonusTurns : null;
  const nextMonth = new Date(nowMs);
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);

  return {
    used,
    resetsAtMs: effective !== null ? nextMonth.getTime() : null,
    resetHours: null,
    resetDays: effective !== null ? getDaysUntilQuotaReset() : null,
  };
}

function applyPendingUsed(
  used: Record<QuotaKind, number>,
  pending: Record<QuotaKind, number>,
  limits: Record<QuotaKind, number | null>,
): Record<QuotaKind, number> {
  const next = { ...used };
  for (const kind of Object.keys(pending) as QuotaKind[]) {
    const bump = pending[kind];
    if (bump <= 0) continue;
    const limit = limits[kind];
    next[kind] = limit === null ? used[kind] + bump : Math.min(limit, used[kind] + bump);
  }
  return next;
}

function docDataFromApiUsage(
  planId: LunaPlanId,
  usage: Awaited<ReturnType<typeof lunaFetchUsage>>,
): Record<string, unknown> {
  if (usesRollingWindow(planId)) {
    const windowStart =
      usage.resetsAtMs != null ? usage.resetsAtMs - FREE_QUOTA_WINDOW_MS : Date.now();
    return {
      messages: usage.used.messages,
      images: usage.used.images,
      documents: usage.used.documents,
      voice: usage.used.voice,
      windowStart,
    };
  }
  return {
    turns: usage.used.messages,
    bonusTurns: usage.bonusTurns,
  };
}

const CLOCK_TICK_MS = 30_000;

/** Lê uso na nuvem (janela rolante no Grátis · mensal nos pagos). */
export function useLunaUsage(
  planId: LunaPlanId,
  uid: string | null,
  getIdToken?: () => Promise<string | null>,
): UseLunaUsageResult {
  const [docData, setDocData] = useState<Record<string, unknown> | undefined>(undefined);
  const [bonusTurns, setBonusTurns] = useState(0);
  const [pendingUsed, setPendingUsed] = useState<Record<QuotaKind, number>>(emptyUsed());
  const [clockTick, setClockTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periodKey = usesRollingWindow(planId) ? FREE_USAGE_DOC_ID : currentMonthKey();

  const parsed = useMemo(
    () => parseUsageDoc(planId, docData, bonusTurns, Date.now()),
    [planId, docData, bonusTurns, clockTick],
  );

  const limits = useMemo((): Record<QuotaKind, number | null> => {
    const baseLimits = limitsForPlan(planId);
    const next = { ...baseLimits };
    if (!usesRollingWindow(planId) && next.messages !== null) {
      next.messages = next.messages + bonusTurns;
    }
    return next;
  }, [bonusTurns, planId]);

  const used = useMemo(
    () => applyPendingUsed(parsed.used, pendingUsed, limits),
    [parsed.used, pendingUsed, limits],
  );

  const { resetsAtMs, resetHours, resetDays } = parsed;

  useEffect(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (!uid || resetsAtMs == null) return;

    const delay = Math.max(0, resetsAtMs - Date.now()) + 80;
    resetTimerRef.current = setTimeout(() => {
      setClockTick((t) => t + 1);
      setPendingUsed(emptyUsed());
    }, delay);

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [uid, resetsAtMs]);

  useEffect(() => {
    if (!uid) return;
    const id = setInterval(() => setClockTick((t) => t + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const onState = (state: AppStateStatus) => {
      if (state === 'active') setClockTick((t) => t + 1);
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [uid]);

  const refreshFromApi = useCallback(
    async (idToken: string) => {
      try {
        const usage = await lunaFetchUsage(idToken);
        setDocData(docDataFromApiUsage(planId, usage));
        setBonusTurns(usage.bonusTurns);
        setPendingUsed(emptyUsed());
        setClockTick((t) => t + 1);
      } catch {
        /* rede / auth — mantém último snapshot */
      }
    },
    [planId],
  );

  useEffect(() => {
    if (!uid) {
      setDocData(undefined);
      setBonusTurns(0);
      setPendingUsed(emptyUsed());
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

    void getDocFromServer(ref)
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        setDocData(data);
        if (!usesRollingWindow(planId) && typeof data.bonusTurns === 'number') {
          setBonusTurns(data.bonusTurns);
        }
        setPendingUsed(emptyUsed());
      })
      .catch(() => {});

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
        setDocData(data);
        setPendingUsed(emptyUsed());
        setLoading(false);
        if (!snap.metadata.fromCache) setClockTick((t) => t + 1);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [uid, periodKey, planId]);

  useEffect(() => {
    if (!uid || !getIdToken) return;
    let cancelled = false;
    void (async () => {
      const token = await getIdToken();
      if (!token || cancelled) return;
      await refreshFromApi(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, periodKey, planId, getIdToken, refreshFromApi]);

  const bumpUsage = useCallback((kind: QuotaKind, amount = 1) => {
    if (amount < 1) return;
    setPendingUsed((prev) => ({ ...prev, [kind]: prev[kind] + amount }));
    setClockTick((t) => t + 1);
  }, []);

  return useMemo((): UseLunaUsageResult => {
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

    const effectiveLimit = limits.messages;
    const usedMessages = used.messages;
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
      used,
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
      bumpUsage,
      refreshFromApi,
    };
  }, [
    planId,
    periodKey,
    used,
    limits,
    bonusTurns,
    resetsAtMs,
    resetHours,
    resetDays,
    loading,
    bumpUsage,
    refreshFromApi,
  ]);
}
