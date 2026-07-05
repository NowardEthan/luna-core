import type { ChatMessage } from '../data/fixtures';
import {
  fetchConversationTitle,
  subscribeMessages,
} from './firebase/firestoreChat';

const MAX_WARM = 8;

interface WarmEntry {
  messages: ChatMessage[];
  title: string;
  hasMessages: boolean;
  unsubscribe: () => void;
}

const warm = new Map<string, WarmEntry>();
const lru: string[] = [];

function touchLru(sessionId: string) {
  const idx = lru.indexOf(sessionId);
  if (idx >= 0) lru.splice(idx, 1);
  lru.push(sessionId);
}

function evictCold() {
  while (lru.length > MAX_WARM) {
    const id = lru.shift();
    if (!id) break;
    stopWarmSession(id);
  }
}

export function getWarmSnapshot(
  sessionId: string,
): { messages: ChatMessage[]; title: string } | null {
  const entry = warm.get(sessionId);
  if (!entry) return null;
  return { messages: entry.messages, title: entry.title };
}

export function stopWarmSession(sessionId: string) {
  const entry = warm.get(sessionId);
  if (!entry) return;
  entry.unsubscribe();
  warm.delete(sessionId);
  const idx = lru.indexOf(sessionId);
  if (idx >= 0) lru.splice(idx, 1);
}

/** Libera listener warm — a subscrição ativa do thread assume. */
export function releaseWarmForActive(sessionId: string) {
  stopWarmSession(sessionId);
}

export function warmSession(uid: string, sessionId: string) {
  if (warm.has(sessionId)) {
    touchLru(sessionId);
    return;
  }

  const entry: WarmEntry = {
    messages: [],
    title: 'Luna',
    hasMessages: false,
    unsubscribe: () => {},
  };

  void fetchConversationTitle(uid, sessionId).then((title) => {
    if (warm.get(sessionId) === entry) {
      entry.title = title;
    }
  });

  entry.unsubscribe = subscribeMessages(
    uid,
    sessionId,
    (messages) => {
      entry.messages = messages;
      entry.hasMessages = true;
    },
    () => {
      /* prefetch silencioso */
    },
  );

  warm.set(sessionId, entry);
  touchLru(sessionId);
  evictCold();
}

/** Pré-carrega snapshot local (modo demo / offline). */
export function seedWarmSnapshot(sessionId: string, messages: ChatMessage[], title: string) {
  if (warm.has(sessionId)) {
    const entry = warm.get(sessionId)!;
    entry.messages = messages;
    entry.title = title;
    entry.hasMessages = messages.length > 0;
    touchLru(sessionId);
    return;
  }

  warm.set(sessionId, {
    messages,
    title,
    hasMessages: messages.length > 0,
    unsubscribe: () => {},
  });
  touchLru(sessionId);
  evictCold();
}

/** Prefetch das conversas recentes enquanto o app está aberto. */
export function prefetchRecentSessions(
  uid: string,
  sessionIds: string[],
  opts?: { skip?: Set<string>; limit?: number },
) {
  const skip = opts?.skip ?? new Set<string>();
  const limit = opts?.limit ?? MAX_WARM;

  sessionIds
    .filter((id) => !skip.has(id))
    .slice(0, limit)
    .forEach((id) => warmSession(uid, id));
}

export function clearWarmCache() {
  for (const id of [...warm.keys()]) {
    stopWarmSession(id);
  }
}
