import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { doc, getDocFromServer, onSnapshot, type Timestamp } from 'firebase/firestore';

import { lunaFetchUsage } from '../../data/lunaClient';
import { getLunaFirestore } from '../../lib/firebase/client';
import { userUsageDoc } from '../../lib/firebase/paths';
import {
  computeWindowResetsAt,
  computeWeeklyResetsAt,
  currentMonthKey,
  FREE_QUOTA_WINDOW_MS,
  FREE_USAGE_DOC_ID,
  getDaysUntilQuotaReset,
  hoursUntilReset,
  limitsForPlan,
  usesRollingWindow,
  WEEKLY_QUOTA_WINDOW_MS,
  WEEKLY_USAGE_DOC_ID,
  weeklyMessageLimitForPlan,
  type QuotaKind,
} from './planQuotas';
import type { LunaPlanId } from './types';

export type { QuotaKind };

export type LunaUsageSnapshot = {
  planId: LunaPlanId;
  cycle: 'window' | 'monthly' | 'unlimited';
  bindingCycle?: 'window' | 'weekly' | 'monthly';
  windowHours: number | null;
  periodKey: string;
  used: Record<QuotaKind, number>;
  limits: Record<QuotaKind, number | null>;
  remaining: Record<QuotaKind, number | null>;
  bonusTurns: number;
  resetsAtMs: number | null;
  resetHours: number | null;
  resetDays: number | null;
  weeklyMessages?: {
    used: number;
    limit: number;
    remaining: number;
    resetsAtMs: number;
  } | null;
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

function readWeeklyMessages(
  data: Record<string, unknown> | undefined,
  nowMs: number,
): { used: number; weekStart: number } {
  const storedStart = coerceWindowStart(data?.weekStart, nowMs);
  if (nowMs - storedStart >= WEEKLY_QUOTA_WINDOW_MS) {
    return { used: 0, weekStart: nowMs };
  }
  return {
    used: typeof data?.messages === 'number' ? data.messages : 0,
    weekStart: storedStart,
  };
}

function mergeWeeklyMessageQuota(
  planId: LunaPlanId,
  windowRemaining: number | null,
  windowResetsAt: number | null,
  weeklyUsed: number,
  weekStart: number,
  pendingWeekly: number,
): {
  remaining: number | null;
  resetsAtMs: number | null;
  bindingCycle: 'window' | 'weekly';
  weeklyMessages: LunaUsageSnapshot['weeklyMessages'];
} {
  const weeklyLimit = weeklyMessageLimitForPlan(planId);
  if (weeklyLimit === null || !usesRollingWindow(planId)) {
    return {
      remaining: windowRemaining,
      resetsAtMs: windowResetsAt,
      bindingCycle: 'window',
      weeklyMessages: null,
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
    weeklyMessages: {
      used: effectiveWeeklyUsed,
      limit: weeklyLimit,
      remaining: weeklyRemaining,
      resetsAtMs: weeklyResetsAt,
    },
  };
}

function parseUsageDoc(
  planId: LunaPlanId,
  data: Record<string, unknown> | undefined,
  bonusTurns: number,
  nowMs: number,
): Pick<LunaUsageSnapshot, 'used' | 'resetsAtMs' | 'resetHours' | 'resetDays'> {
  const limits = limitsForPlan(planId);
  console.log('[LunaUsage] parseUsageDoc', { planId, keys: data ? Object.keys(data) : null, bonusTurns });

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
): { window?: Record<string, unknown>; weekly?: Record<string, unknown> } {
  if (usesRollingWindow(planId)) {
    const windowStart =
      usage.resetsAtMs != null && usage.bindingCycle !== 'weekly'
        ? usage.resetsAtMs - FREE_QUOTA_WINDOW_MS
        : Date.now();
    const weekly = usage.weeklyMessages;
    const weekStart =
      weekly?.resetsAtMs != null ? weekly.resetsAtMs - WEEKLY_QUOTA_WINDOW_MS : Date.now();
    return {
      window: {
        messages: usage.used.messages,
        images: usage.used.images,
        documents: usage.used.documents,
        voice: usage.used.voice,
        windowStart,
      },
      weekly: weekly
        ? {
            messages: weekly.used,
            weekStart,
          }
        : undefined,
    };
  }
  return {
    window: {
      turns: usage.used.messages,
      bonusTurns: usage.bonusTurns,
    },
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
  const [weeklyDocData, setWeeklyDocData] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [bonusTurns, setBonusTurns] = useState(0);
  const [pendingUsed, setPendingUsed] = useState<Record<QuotaKind, number>>(emptyUsed());
  const [pendingWeeklyMessages, setPendingWeeklyMessages] = useState(0);
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
      setPendingWeeklyMessages(0);
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
        console.log('[LunaUsage] refreshFromApi usage', {
          planId: usage.planId,
          periodKey: usage.periodKey,
          usedMessages: usage.used.messages,
          limitsMessages: usage.limits.messages,
        });
        const parsedApi = docDataFromApiUsage(planId, usage);
        setDocData(parsedApi.window);
        setWeeklyDocData(parsedApi.weekly);
        setBonusTurns(usage.bonusTurns);
        setPendingUsed(emptyUsed());
        setPendingWeeklyMessages(0);
        setClockTick((t) => t + 1);
      } catch (err) {
        console.log('[LunaUsage] refreshFromApi error', err);
        /* rede / auth — mantém último snapshot */
      }
    },
    [planId],
  );

  useEffect(() => {
    if (!uid) {
      setDocData(undefined);
      setWeeklyDocData(undefined);
      setBonusTurns(0);
      setPendingUsed(emptyUsed());
      setPendingWeeklyMessages(0);
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
    console.log('[LunaUsage] Firestore subscribe', { uid, periodKey, planId });

    void getDocFromServer(ref)
      .then((snap) => {
        console.log('[LunaUsage] getDocFromServer', { exists: snap.exists(), fromCache: snap.metadata.fromCache, data: snap.data() });
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
        console.log('[LunaUsage] onSnapshot', { exists: snap.exists(), fromCache: snap.metadata.fromCache, data });
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
    if (!uid || !usesRollingWindow(planId)) {
      setWeeklyDocData(undefined);
      return;
    }

    const db = getLunaFirestore();
    if (!db) return;

    const weeklyRef = doc(db, userUsageDoc(uid, WEEKLY_USAGE_DOC_ID));
    const unsub = onSnapshot(
      weeklyRef,
      (snap) => {
        setWeeklyDocData(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
        setPendingWeeklyMessages(0);
      },
      () => {},
    );
    return unsub;
  }, [uid, planId]);

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
    console.log('[LunaUsage] bumpUsage', { kind, amount });
    setPendingUsed((prev) => ({ ...prev, [kind]: prev[kind] + amount }));
    if (kind === 'messages' && usesRollingWindow(planId)) {
      setPendingWeeklyMessages((prev) => prev + amount);
    }
    setClockTick((t) => t + 1);
  }, [planId]);

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

    const weeklyParsed = readWeeklyMessages(weeklyDocData, Date.now());
    const weeklyMerge =
      usesRollingWindow(planId) && remaining.messages !== null
        ? mergeWeeklyMessageQuota(
            planId,
            remaining.messages,
            resetsAtMs,
            weeklyParsed.used,
            weeklyParsed.weekStart,
            pendingWeeklyMessages,
          )
        : null;

    if (weeklyMerge) {
      remaining.messages = weeklyMerge.remaining;
    }

    const effectiveLimit =
      weeklyMerge?.bindingCycle === 'weekly'
        ? weeklyMerge.weeklyMessages?.limit ?? limits.messages
        : limits.messages;
    const usedMessages =
      weeklyMerge?.bindingCycle === 'weekly'
        ? weeklyMerge.weeklyMessages?.used ?? used.messages
        : used.messages;
    const displayResetsAtMs = weeklyMerge?.resetsAtMs ?? resetsAtMs;
    const pct =
      effectiveLimit !== null && effectiveLimit > 0
        ? Math.min(100, Math.floor((usedMessages / effectiveLimit) * 100))
        : 0;

    console.log('[LunaUsage] computed', { planId, periodKey, usedMessages, effectiveLimit, pct, loading });

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
      resetsAtMs: displayResetsAtMs,
      resetHours:
        weeklyMerge?.bindingCycle === 'weekly' && weeklyMerge.weeklyMessages
          ? hoursUntilReset(weeklyMerge.weeklyMessages.resetsAtMs, Date.now())
          : resetHours,
      resetDays,
      weeklyMessages: weeklyMerge?.weeklyMessages ?? null,
      bindingCycle: weeklyMerge?.bindingCycle ?? (usesRollingWindow(planId) ? 'window' : 'monthly'),
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
    weeklyDocData,
    pendingWeeklyMessages,
    loading,
    bumpUsage,
    refreshFromApi,
  ]);
}
