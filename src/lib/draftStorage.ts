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
  } catch (err) {
    console.warn('[draftStorage] saveDraft failed — estado em memória continua válido', err);
  }
}

/** Metadados da sessão ativa — restaura thread + rascunho após kill da app. */
const META_KEY = `${PREFIX}.meta`;

export type MainTabId = 'inicio' | 'conversas' | 'conta' | 'definicoes';

export interface ChatDraftMeta {
  screen: 'home' | 'thread';
  sessionId: string | null;
  /** Aba do shell quando em home. */
  mainTab?: MainTabId;
  /** Offset vertical da lista invertida (0 = fim da conversa). */
  threadScrollY?: number;
  /** Título em cache para header instantâneo no restore. */
  title?: string;
}

const MAIN_TABS: MainTabId[] = ['inicio', 'conversas', 'conta', 'definicoes'];

function parseMainTab(value: unknown): MainTabId | undefined {
  return typeof value === 'string' && MAIN_TABS.includes(value as MainTabId)
    ? (value as MainTabId)
    : undefined;
}

export function parseChatDraftMeta(raw: unknown): ChatDraftMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const screen = o.screen === 'thread' || o.screen === 'home' ? o.screen : null;
  if (!screen) return null;
  const sessionId =
    o.sessionId === null || typeof o.sessionId === 'string' ? (o.sessionId as string | null) : null;
  const threadScrollY = typeof o.threadScrollY === 'number' ? o.threadScrollY : undefined;
  const title = typeof o.title === 'string' ? o.title : undefined;
  return {
    screen,
    sessionId,
    mainTab: parseMainTab(o.mainTab),
    threadScrollY,
    title,
  };
}

export async function loadChatDraftMeta(): Promise<ChatDraftMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    return parseChatDraftMeta(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveChatDraftMeta(meta: ChatDraftMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn('[draftStorage] saveChatDraftMeta failed', err);
  }
}

export async function clearChatDraftMeta(): Promise<void> {
  try {
    await AsyncStorage.removeItem(META_KEY);
  } catch {
    /* noop */
  }
}
