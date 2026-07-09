import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import type { RosaryMysterySet } from '../../hooks/useRosary';
import type { RosaryDayDoc, RosaryMonthMap } from '../rosary/rosaryJournalTypes';
import { monthDateRange } from '../rosary/rosaryJournalUtils';
import { getLunaFirestore } from './client';
import { userRosaryDayDoc, userRosaryDaysCol } from './paths';

function docToRosaryDay(id: string, data: Record<string, unknown>): RosaryDayDoc {
  return {
    dateKey: typeof data.dateKey === 'string' ? data.dateKey : id,
    touched: Boolean(data.touched),
    completed: Boolean(data.completed),
    sessionCount: typeof data.sessionCount === 'number' ? data.sessionCount : 0,
    lastMysterySet: data.lastMysterySet as RosaryMysterySet | undefined,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
  };
}

export async function fetchRosaryMonth(
  uid: string,
  year: number,
  month: number,
): Promise<RosaryMonthMap> {
  const db = getLunaFirestore();
  if (!db) return {};

  const { start, end } = monthDateRange(year, month);
  const col = collection(db, userRosaryDaysCol(uid));
  const q = query(col, where('dateKey', '>=', start), where('dateKey', '<=', end));
  const snap = await getDocs(q);
  const map: RosaryMonthMap = {};
  snap.forEach((d) => {
    map[d.id] = docToRosaryDay(d.id, d.data() as Record<string, unknown>);
  });
  return map;
}

export function subscribeRosaryMonth(
  uid: string,
  year: number,
  month: number,
  onChange: (days: RosaryMonthMap) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange({});
    return () => {};
  }

  const { start, end } = monthDateRange(year, month);
  const col = collection(db, userRosaryDaysCol(uid));
  const q = query(col, where('dateKey', '>=', start), where('dateKey', '<=', end));

  return onSnapshot(
    q,
    (snap) => {
      const map: RosaryMonthMap = {};
      snap.forEach((d) => {
        map[d.id] = docToRosaryDay(d.id, d.data() as Record<string, unknown>);
      });
      onChange(map);
    },
    (err) => onError?.(err),
  );
}

export async function upsertRosaryDay(
  uid: string,
  dateKey: string,
  patch: Partial<Pick<RosaryDayDoc, 'touched' | 'completed' | 'sessionCount' | 'lastMysterySet'>>,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const ref = doc(db, userRosaryDayDoc(uid, dateKey));
  await setDoc(
    ref,
    {
      dateKey,
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
