import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';

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
  usesRollingWindow,
  WEEKLY_QUOTA_WINDOW_MS,
  WEEKLY_USAGE_DOC_ID,
  windowTokenLimitForPlan,
  computeWeeklyResetsAt,
} from './planQuotas';
import {
  mergeWeeklyTokenQuota,
  nextQuotaResetMs,
  readWeeklyTokens,
  readWindowTokens,
} from './quotaMerge';
import type { WeeklyTokensSnapshot } from './quotaMerge';
import type { LunaPlanId } from './types';

export type ReducedModeSnapshot = {
  available: boolean;
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  resetsAtMs: number;
  requestsPerMinute: number;
  inputTokensPerMinute: number;
};

export type LunaUsageSnapshot = {
  planId: LunaPlanId;
  cycle: 'window' | 'monthly' | 'unlimited';
  bindingCycle?: 'window' | 'weekly' | 'monthly';
  windowHours: number | null;
  periodKey: string;
  usedTokens: number;
  windowTokenLimit: number | null;
  remainingTokens: number | null;
  bonusTurns: number;
  resetsAtMs: number | null;
  resetHours: number | null;
  resetDays: number | null;
  weeklyTokens?: WeeklyTokensSnapshot | null;
  effectiveLimit: number | null;
  /** Uso na janela rolante (independente do binding semanal). */
  windowUsedTokens: number;
  pct: number;
  loading: boolean;
  /** Fallback Cerebras free quando a quota do plano esgota. */
  reducedMode?: ReducedModeSnapshot | null;
};

export type UseLunaUsageResult = LunaUsageSnapshot & {
  bumpTokens: (amount: number) => void;
  rollbackTokens: (amount: number) => void;
  refreshFromApi: (idToken: string) => Promise<void>;
};

const LOADING_TIMEOUT_MS = 2_000;
const CLOCK_TICK_MS = 30_000;

function parseUsageDoc(
  planId: LunaPlanId,
  data: Record<string, unknown> | undefined,
  bonusTurns: number,
  nowMs: number,
): Pick<LunaUsageSnapshot, 'usedTokens' | 'resetsAtMs' | 'resetHours' | 'resetDays'> {
  if (usesRollingWindow(planId)) {
    const window = readWindowTokens(data, nowMs, FREE_QUOTA_WINDOW_MS);
    const resetsAtMs = computeWindowResetsAt(window.windowStart, nowMs);
    return {
      usedTokens: window.used,
      resetsAtMs,
      resetHours: hoursUntilReset(resetsAtMs, nowMs),
      resetDays: null,
    };
  }

  const nextMonth = new Date(nowMs);
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);

  return {
    usedTokens: 0,
    resetsAtMs: null,
    resetHours: null,
    resetDays: getDaysUntilQuotaReset(),
  };
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
    const weekly = usage.weeklyTokens;
    const weekStart =
      weekly?.resetsAtMs != null ? weekly.resetsAtMs - WEEKLY_QUOTA_WINDOW_MS : Date.now();
    return {
      window: {
        tokens: usage.usedTokens,
        windowStart,
      },
      weekly: weekly
        ? {
            tokens: weekly.used,
            weekStart,
          }
        : undefined,
    };
  }
  return {
    window: {
      bonusTurns: usage.bonusTurns,
    },
  };
}

/** Lê uso na nuvem (janela rolante no Grátis · ilimitado nos planos BYOK). */
export function useLunaUsage(
  planId: LunaPlanId,
  uid: string | null,
  getIdToken?: () => Promise<string | null>,
): UseLunaUsageResult {
  const [docData, setDocData] = useState<Record<string, unknown> | undefined>(undefined);
  const [weeklyDocData, setWeeklyDocData] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [windowLoaded, setWindowLoaded] = useState(false);
  const [weeklyLoaded, setWeeklyLoaded] = useState(!usesRollingWindow(planId));
  const [bonusTurns, setBonusTurns] = useState(0);
  const [pendingTokens, setPendingTokens] = useState(0);
  const [pendingWeeklyTokens, setPendingWeeklyTokens] = useState(0);
  const [reducedMode, setReducedMode] = useState<ReducedModeSnapshot | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periodKey = usesRollingWindow(planId) ? FREE_USAGE_DOC_ID : currentMonthKey();
  const needsWeekly = usesRollingWindow(planId);
  const loading = !windowLoaded || (needsWeekly && !weeklyLoaded);

  const parsed = useMemo(
    () => parseUsageDoc(planId, docData, bonusTurns, Date.now()),
    [planId, docData, bonusTurns, clockTick],
  );

  const windowLimit = useMemo(() => windowTokenLimitForPlan(planId), [planId]);

  const usedTokens = useMemo(() => {
    if (windowLimit === null) return 0;
    return Math.min(windowLimit, parsed.usedTokens + pendingTokens);
  }, [parsed.usedTokens, pendingTokens, windowLimit]);

  const { resetsAtMs: windowResetsAt, resetHours, resetDays } = parsed;

  const weeklyParsed = useMemo(
    () => readWeeklyTokens(weeklyDocData, Date.now()),
    [weeklyDocData, clockTick],
  );

  const weeklyResetsAt = needsWeekly ? computeWeeklyResetsAt(weeklyParsed.weekStart) : null;

  useEffect(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (!uid) return;

    const nextReset = nextQuotaResetMs(windowResetsAt, needsWeekly ? weeklyResetsAt : null);
    if (nextReset == null) return;

    const delay = Math.max(0, nextReset - Date.now()) + 80;
    resetTimerRef.current = setTimeout(() => {
      const now = Date.now();
      if (windowResetsAt != null && now >= windowResetsAt - 50) {
        setPendingTokens(0);
      }
      if (weeklyResetsAt != null && now >= weeklyResetsAt - 50) {
        setPendingWeeklyTokens(0);
      }
      setClockTick((t) => t + 1);
    }, delay);

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [uid, windowResetsAt, weeklyResetsAt, needsWeekly]);

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
        const parsedApi = docDataFromApiUsage(planId, usage);
        setDocData(parsedApi.window);
        setWeeklyDocData(parsedApi.weekly);
        setBonusTurns(usage.bonusTurns);
        setReducedMode(usage.reducedMode ?? null);
        setPendingTokens(0);
        setPendingWeeklyTokens(0);
        setWindowLoaded(true);
        if (needsWeekly) setWeeklyLoaded(true);
        setClockTick((t) => t + 1);
      } catch (err) {
        console.warn('[LunaUsage] refreshFromApi error', err);
      }
    },
    [needsWeekly, planId],
  );

  useEffect(() => {
    if (!uid) {
      setDocData(undefined);
      setWeeklyDocData(undefined);
      setBonusTurns(0);
      setPendingTokens(0);
      setPendingWeeklyTokens(0);
      setReducedMode(null);
      setWindowLoaded(false);
      setWeeklyLoaded(!usesRollingWindow(planId));
      return;
    }

    const db = getLunaFirestore();
    if (!db) {
      setWindowLoaded(true);
      setWeeklyLoaded(true);
      return;
    }

    setWindowLoaded(false);
    setWeeklyLoaded(!usesRollingWindow(planId));

    const loadingTimeout = setTimeout(() => {
      setWindowLoaded(true);
      if (usesRollingWindow(planId)) setWeeklyLoaded(true);
    }, LOADING_TIMEOUT_MS);

    const ref = doc(db, userUsageDoc(uid, periodKey));

    void getDocFromServer(ref)
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        setDocData(data);
        if (!usesRollingWindow(planId) && typeof data.bonusTurns === 'number') {
          setBonusTurns(data.bonusTurns);
        }
        setPendingTokens(0);
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
        setPendingTokens(0);
        setWindowLoaded(true);
        if (!snap.metadata.fromCache) setClockTick((t) => t + 1);
      },
      () => setWindowLoaded(true),
    );

    return () => {
      clearTimeout(loadingTimeout);
      unsub();
    };
  }, [uid, periodKey, planId]);

  useEffect(() => {
    if (!uid || !usesRollingWindow(planId)) {
      setWeeklyDocData(undefined);
      setWeeklyLoaded(true);
      return;
    }

    const db = getLunaFirestore();
    if (!db) {
      setWeeklyLoaded(true);
      return;
    }

    setWeeklyLoaded(false);
    const weeklyRef = doc(db, userUsageDoc(uid, WEEKLY_USAGE_DOC_ID));

    void getDocFromServer(weeklyRef)
      .then((snap) => {
        setWeeklyDocData(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
      })
      .catch(() => {});

    const unsub = onSnapshot(
      weeklyRef,
      (snap) => {
        setWeeklyDocData(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
        setPendingWeeklyTokens(0);
        setWeeklyLoaded(true);
      },
      () => setWeeklyLoaded(true),
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

  const bumpTokens = useCallback(
    (amount: number) => {
      if (amount < 1) return;
      setPendingTokens((prev) => prev + amount);
      if (usesRollingWindow(planId)) {
        setPendingWeeklyTokens((prev) => prev + amount);
      }
      setClockTick((t) => t + 1);
    },
    [planId],
  );

  const rollbackTokens = useCallback(
    (amount: number) => {
      if (amount < 1) return;
      setPendingTokens((prev) => Math.max(0, prev - amount));
      if (usesRollingWindow(planId)) {
        setPendingWeeklyTokens((prev) => Math.max(0, prev - amount));
      }
      setClockTick((t) => t + 1);
    },
    [planId],
  );

  return useMemo((): UseLunaUsageResult => {
    const windowRemaining =
      windowLimit !== null ? Math.max(0, windowLimit - usedTokens) : null;

    const weeklyMerge =
      usesRollingWindow(planId) && windowRemaining !== null && !loading
        ? mergeWeeklyTokenQuota(
            planId,
            windowRemaining,
            windowResetsAt,
            weeklyParsed.used,
            weeklyParsed.weekStart,
            pendingWeeklyTokens,
          )
        : null;

    const remainingTokens = weeklyMerge?.remaining ?? windowRemaining;
    const effectiveLimit =
      weeklyMerge?.bindingCycle === 'weekly'
        ? weeklyMerge.weeklyTokens?.limit ?? windowLimit
        : windowLimit;
    const displayUsedTokens =
      weeklyMerge?.bindingCycle === 'weekly'
        ? weeklyMerge.weeklyTokens?.used ?? usedTokens
        : usedTokens;
    const displayResetsAtMs = weeklyMerge?.resetsAtMs ?? windowResetsAt;
    const pct =
      effectiveLimit !== null && effectiveLimit > 0
        ? Math.min(100, Math.floor((displayUsedTokens / effectiveLimit) * 100))
        : 0;

    const unlimited = !usesRollingWindow(planId);

    return {
      planId,
      cycle: usesRollingWindow(planId) ? 'window' : unlimited ? 'unlimited' : 'monthly',
      windowHours: usesRollingWindow(planId) ? FREE_QUOTA_WINDOW_MS / 3_600_000 : null,
      periodKey,
      usedTokens: displayUsedTokens,
      windowTokenLimit: windowLimit,
      remainingTokens,
      bonusTurns,
      resetsAtMs: displayResetsAtMs,
      resetHours:
        weeklyMerge?.bindingCycle === 'weekly' && weeklyMerge.weeklyTokens
          ? hoursUntilReset(weeklyMerge.weeklyTokens.resetsAtMs, Date.now())
          : resetHours,
      resetDays,
      weeklyTokens: weeklyMerge?.weeklyTokens ?? null,
      bindingCycle: weeklyMerge?.bindingCycle ?? (usesRollingWindow(planId) ? 'window' : 'monthly'),
      effectiveLimit,
      windowUsedTokens: usedTokens,
      pct,
      loading,
      reducedMode,
      bumpTokens,
      rollbackTokens,
      refreshFromApi,
    };
  }, [
    planId,
    periodKey,
    usedTokens,
    windowLimit,
    bonusTurns,
    windowResetsAt,
    resetHours,
    resetDays,
    weeklyParsed,
    pendingWeeklyTokens,
    loading,
    reducedMode,
    bumpTokens,
    rollbackTokens,
    refreshFromApi,
  ]);
}
