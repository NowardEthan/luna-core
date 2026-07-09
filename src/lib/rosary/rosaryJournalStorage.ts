import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RosaryMonthMap } from './rosaryJournalTypes';
import { monthKey } from './rosaryJournalUtils';

const PREFIX = '@luna/rosary/journal/';

function cacheKey(uid: string, year: number, month: number): string {
  return `${PREFIX}${uid}/${monthKey(year, month)}`;
}

export async function loadRosaryMonthCache(
  uid: string,
  year: number,
  month: number,
): Promise<RosaryMonthMap | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(uid, year, month));
    if (!raw) return null;
    return JSON.parse(raw) as RosaryMonthMap;
  } catch {
    return null;
  }
}

export async function saveRosaryMonthCache(
  uid: string,
  year: number,
  month: number,
  days: RosaryMonthMap,
): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(uid, year, month), JSON.stringify(days));
  } catch {
    /* melhor esforço */
  }
}
