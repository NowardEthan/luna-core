import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, SessionItem } from '../data/fixtures';
import { formatRelativeTime } from './firebase/formatRelativeTime';
import type { TrashSessionItem } from './firebase/firestoreTrash';

const STORAGE_KEY = 'orbit.trash.v1';

interface LocalTrashConversation {
  session: SessionItem;
  messages: ChatMessage[];
  deletedAt: number;
  messageCount: number;
}

interface LocalTrashStore {
  conversations: Record<string, LocalTrashConversation>;
}

async function readStore(): Promise<LocalTrashStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { conversations: {} };
    return JSON.parse(raw) as LocalTrashStore;
  } catch {
    return { conversations: {} };
  }
}

async function writeStore(store: LocalTrashStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function localTrashBackupConversation(
  session: SessionItem,
  messages: ChatMessage[],
): Promise<void> {
  const store = await readStore();
  store.conversations[session.id] = {
    session,
    messages,
    deletedAt: Date.now(),
    messageCount: messages.length,
  };
  await writeStore(store);
}

export async function localTrashBackupMessage(
  session: SessionItem,
  message: ChatMessage,
): Promise<void> {
  const store = await readStore();
  const trashId = `msg-${session.id}-${message.id}-${Date.now()}`;
  store.conversations[trashId] = {
    session,
    messages: [message],
    deletedAt: Date.now(),
    messageCount: 1,
  };
  await writeStore(store);
}

export async function localTrashList(): Promise<TrashSessionItem[]> {
  const store = await readStore();
  return Object.entries(store.conversations)
    .filter(([id]) => !id.startsWith('msg-'))
    .map(([id, entry]) => ({
      id,
      title: entry.session.title,
      preview: entry.session.preview,
      updatedAt: formatRelativeTime(new Date(entry.deletedAt)),
      deletedAtLabel: formatRelativeTime(new Date(entry.deletedAt)),
      messageCount: entry.messageCount,
      _deletedAt: entry.deletedAt,
    }))
    .sort((a, b) => b._deletedAt - a._deletedAt)
    .map(({ _deletedAt: _, ...rest }) => rest);
}

export async function localTrashRestore(conversationId: string): Promise<{
  session: SessionItem;
  messages: ChatMessage[];
} | null> {
  const store = await readStore();
  const entry = store.conversations[conversationId];
  if (!entry) return null;
  delete store.conversations[conversationId];
  await writeStore(store);
  return { session: entry.session, messages: entry.messages };
}

export async function localTrashPermanentDelete(conversationId: string): Promise<void> {
  const store = await readStore();
  delete store.conversations[conversationId];
  await writeStore(store);
}

export async function localTrashGetMessages(conversationId: string): Promise<ChatMessage[]> {
  const store = await readStore();
  return store.conversations[conversationId]?.messages ?? [];
}
