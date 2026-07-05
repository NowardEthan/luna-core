import AsyncStorage from '@react-native-async-storage/async-storage';

/** Chave legada (global) — não usar em contas novas. */
const LEGACY_KEY = 'orbit.profile.local';
const KEY_PREFIX = 'orbit.profile.v2';

export type LocalProfileData = {
  bio?: string;
  displayName?: string;
  pinnedConversationIds?: string[];
  avatarUri?: string;
  coverUri?: string;
  avatarRemoved?: boolean;
  coverRemoved?: boolean;
};

function scopedKey(uid: string): string {
  return `${KEY_PREFIX}.${uid}`;
}

/** Remove perfil legado global (sessões antigas antes do v2). */
export async function clearLegacyLocalProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    /* noop */
  }
}

export async function loadLocalProfile(
  uid?: string | null,
  options?: { isAnonymous?: boolean },
): Promise<LocalProfileData> {
  if (!uid) return {};

  const key = scopedKey(uid);
  try {
    let raw = await AsyncStorage.getItem(key);

    // Migração única: legado global → só sessão anónima actual
    if (!raw && options?.isAnonymous) {
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }

    if (!raw) return {};
    return JSON.parse(raw) as LocalProfileData;
  } catch {
    return {};
  }
}

export async function saveLocalProfile(
  patch: Partial<LocalProfileData>,
  uid?: string | null,
): Promise<LocalProfileData> {
  if (!uid) return {};

  const current = await loadLocalProfile(uid);
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(scopedKey(uid), JSON.stringify(next));
  return next;
}

export async function toggleLocalPin(
  conversationId: string,
  uid?: string | null,
): Promise<string[]> {
  if (!uid) return [];

  const current = await loadLocalProfile(uid);
  const set = new Set(current.pinnedConversationIds ?? []);
  if (set.has(conversationId)) set.delete(conversationId);
  else set.add(conversationId);
  const pinnedConversationIds = [...set];
  await saveLocalProfile({ pinnedConversationIds }, uid);
  return pinnedConversationIds;
}
