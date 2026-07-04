import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'orbit.draft.v1';

export const DRAFT_SCOPE_HOME = `${PREFIX}.home`;

export function draftScopeForSession(sessionId: string): string {
  return `${PREFIX}.session.${sessionId}`;
}

export async function loadDraft(scope: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(scope);
    return raw ?? '';
  } catch {
    return '';
  }
}

export async function saveDraft(scope: string, text: string): Promise<void> {
  try {
    if (!text.trim()) {
      await AsyncStorage.removeItem(scope);
      return;
    }
    await AsyncStorage.setItem(scope, text);
  } catch {
    /* offline / quota — estado em memória continua válido */
  }
}

/** Metadados da sessão ativa — restaura thread + rascunho após kill da app. */
const META_KEY = `${PREFIX}.meta`;

export interface ChatDraftMeta {
  screen: 'home' | 'thread';
  sessionId: string | null;
}

export async function loadChatDraftMeta(): Promise<ChatDraftMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChatDraftMeta;
  } catch {
    return null;
  }
}

export async function saveChatDraftMeta(meta: ChatDraftMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* noop */
  }
}

export async function clearChatDraftMeta(): Promise<void> {
  try {
    await AsyncStorage.removeItem(META_KEY);
  } catch {
    /* noop */
  }
}
