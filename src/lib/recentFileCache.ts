import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ComposerAttachment } from './composerAttachmentModel';

const STORAGE_KEY = 'orbit.attach.recentFiles';
const MAX_ITEMS = 40;

type StoredFile = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  size: number;
  mime: string;
  uri: string;
  savedAt: number;
};

function toStored(att: ComposerAttachment): StoredFile | null {
  if (!att.uri) return null;
  return {
    id: att.id,
    kind: att.kind,
    name: att.name,
    size: att.size,
    mime: att.mime,
    uri: att.uri,
    savedAt: Date.now(),
  };
}

function fromStored(raw: StoredFile): ComposerAttachment {
  return {
    id: raw.id,
    kind: raw.kind,
    name: raw.name,
    size: raw.size,
    mime: raw.mime,
    uri: raw.uri,
  };
}

/** Arquivos escolhidos recentemente — lista customizada estilo Telegram. */
export async function loadRecentFiles(): Promise<ComposerAttachment[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredFile[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_ITEMS)
      .map(fromStored);
  } catch {
    return [];
  }
}

export async function rememberRecentFiles(items: ComposerAttachment[]): Promise<void> {
  const stored = items.map(toStored).filter((x): x is StoredFile => x != null);
  if (stored.length === 0) return;

  const existing = await loadRecentFiles();
  const merged: StoredFile[] = [...stored.map((s) => ({ ...s, savedAt: Date.now() }))];

  for (const att of existing) {
    const s = toStored(att);
    if (!s) continue;
    if (merged.some((m) => m.uri === s.uri)) continue;
    merged.push({ ...s, savedAt: s.savedAt ?? Date.now() });
  }

  merged.sort((a, b) => b.savedAt - a.savedAt);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, MAX_ITEMS)));
}
