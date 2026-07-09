import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SessionItem } from '../data/fixtures';
import type { ConversationFolder } from './conversationOrganize/types';

const STORAGE_KEY = 'orbit.collections.v1';

export type LocalSessionOrganizeMeta = {
  title?: string;
  collectionId?: string | null;
  pinned?: boolean;
  titleLocked?: boolean;
};

interface LocalOrganizeStore {
  folders: ConversationFolder[];
  sessionMeta: Record<string, LocalSessionOrganizeMeta>;
}

async function readStore(): Promise<LocalOrganizeStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { folders: [], sessionMeta: {} };
    return JSON.parse(raw) as LocalOrganizeStore;
  } catch {
    return { folders: [], sessionMeta: {} };
  }
}

async function writeStore(store: LocalOrganizeStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function localOrganizeLoad(): Promise<LocalOrganizeStore> {
  return readStore();
}

export async function localOrganizeSaveFolders(folders: ConversationFolder[]): Promise<void> {
  const store = await readStore();
  store.folders = folders;
  await writeStore(store);
}

export async function localOrganizePatchSession(
  sessionId: string,
  patch: LocalSessionOrganizeMeta,
): Promise<void> {
  const store = await readStore();
  store.sessionMeta[sessionId] = { ...store.sessionMeta[sessionId], ...patch };
  await writeStore(store);
}

export function applyLocalOrganizeToSessions(
  sessions: SessionItem[],
  store: LocalOrganizeStore,
): SessionItem[] {
  return sessions.map((s) => {
    const meta = store.sessionMeta[s.id];
    if (!meta) return s;
    return {
      ...s,
      ...(meta.title != null ? { title: meta.title } : {}),
      ...(meta.collectionId !== undefined ? { collectionId: meta.collectionId } : {}),
      ...(meta.pinned !== undefined ? { pinned: meta.pinned } : {}),
    };
  });
}
