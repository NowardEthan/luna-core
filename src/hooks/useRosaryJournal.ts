import { useCallback, useEffect, useMemo, useState } from 'react';

import { subscribeRosaryMonth, upsertRosaryDay } from '../lib/firebase/firestoreRosaryJournal';
import type { RosaryMysterySet } from './useRosary';
import type { RosaryDayDoc, RosaryMonthMap } from '../lib/rosary/rosaryJournalTypes';
import { loadRosaryMonthCache, saveRosaryMonthCache } from '../lib/rosary/rosaryJournalStorage';
import { localDateKey } from '../lib/rosary/rosaryJournalUtils';

type Options = {
  uid: string | null;
  year: number;
  month: number;
};

export function useRosaryJournal({ uid, year, month }: Options) {
  const [days, setDays] = useState<RosaryMonthMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setDays({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadRosaryMonthCache(uid, year, month).then((cached) => {
      if (cancelled) return;
      if (cached) setDays(cached);
    });

    const unsub = subscribeRosaryMonth(
      uid,
      year,
      month,
      (next) => {
        if (cancelled) return;
        setDays(next);
        setLoading(false);
        void saveRosaryMonthCache(uid, year, month, next);
      },
      () => {
        if (!cancelled) setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid, year, month]);

  const mergeLocalDay = useCallback(
    (dateKey: string, patch: Partial<RosaryDayDoc>) => {
      setDays((prev) => {
        const existing = prev[dateKey];
        const next: RosaryDayDoc = {
          dateKey,
          touched: patch.touched ?? existing?.touched ?? false,
          completed: patch.completed ?? existing?.completed ?? false,
          sessionCount: patch.sessionCount ?? existing?.sessionCount ?? 0,
          lastMysterySet: patch.lastMysterySet ?? existing?.lastMysterySet,
          updatedAt: Date.now(),
        };
        const merged = { ...prev, [dateKey]: next };
        if (uid) void saveRosaryMonthCache(uid, year, month, merged);
        return merged;
      });
    },
    [month, uid, year],
  );

  const markTouched = useCallback(
    async (mysterySet?: RosaryMysterySet) => {
      if (!uid) return;
      const dateKey = localDateKey();
      const existing = days[dateKey];
      const sessionCount = (existing?.sessionCount ?? 0) + 1;
      mergeLocalDay(dateKey, {
        touched: true,
        sessionCount,
        lastMysterySet: mysterySet,
      });
      await upsertRosaryDay(uid, dateKey, {
        touched: true,
        sessionCount,
        lastMysterySet: mysterySet,
      });
    },
    [days, mergeLocalDay, uid],
  );

  const markCompleted = useCallback(async () => {
    if (!uid) return;
    const dateKey = localDateKey();
    const existing = days[dateKey];
    mergeLocalDay(dateKey, {
      touched: true,
      completed: true,
      sessionCount: existing?.sessionCount ?? 1,
      lastMysterySet: existing?.lastMysterySet,
    });
    await upsertRosaryDay(uid, dateKey, {
      touched: true,
      completed: true,
      sessionCount: existing?.sessionCount ?? 1,
      lastMysterySet: existing?.lastMysterySet,
    });
  }, [days, mergeLocalDay, uid]);

  const stats = useMemo(() => {
    const values = Object.values(days);
    const touchedDays = values.filter((d) => d.touched).length;
    const completedDays = values.filter((d) => d.completed).length;
    return { touchedDays, completedDays };
  }, [days]);

  return {
    days,
    loading,
    markTouched,
    markCompleted,
    stats,
  };
}
