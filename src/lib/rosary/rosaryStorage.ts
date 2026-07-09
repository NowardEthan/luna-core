import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PrayerMode, RosaryState } from '../../hooks/useRosary';

const PREFIX = '@luna/rosary/';

export type PersistedRosary = {
  state: RosaryState;
  prayerMode: PrayerMode | null;
};

export async function loadRosarySession(sessionId: string): Promise<PersistedRosary | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRosary;
  } catch {
    return null;
  }
}

export async function saveRosarySession(
  sessionId: string,
  data: PersistedRosary,
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIX}${sessionId}`, JSON.stringify(data));
  } catch {
    /* melhor esforço */
  }
}

export async function clearRosarySession(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PREFIX}${sessionId}`);
  } catch {
    /* melhor esforço */
  }
}
