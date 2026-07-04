import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ChatMessage, SessionItem, VoiceClip } from '../../data/fixtures';
import type { ThreadReference } from '../messageReference';
import { getLunaFirestore } from './client';
import { formatRelativeTime } from './formatRelativeTime';
import { userConversationDoc, userConversationMessagesCol, userDoc } from './paths';
import type {
  FirestoreConversationDoc,
  FirestoreMessageDoc,
  LegacyEmbeddedMessage,
} from './types';

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Nova conversa';
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

function toDate(value: unknown): Date {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  if (value instanceof Date) return value;
  return new Date();
}

function normalizeRole(role: unknown): 'user' | 'luna' | null {
  if (role === 'user') return 'user';
  if (role === 'luna' || role === 'assistant') return 'luna';
  return null;
}

function toThreadReference(data: FirestoreMessageDoc['reference']): ThreadReference | undefined {
  if (!data?.messageId || !data.excerpt?.trim()) return undefined;

  if (data.kind === 'document' || data.attachmentId) {
    return {
      kind: 'document',
      messageId: data.messageId,
      role: data.role === 'user' ? 'user' : 'luna',
      messageIndex: data.messageIndex,
      attachmentId: data.attachmentId ?? `att-${data.messageIndex}`,
      attachmentName: data.attachmentName ?? 'Documento',
      attachmentUri: data.attachmentUri,
      excerpt: data.excerpt,
      fullText: data.fullText ?? data.excerpt,
    };
  }

  return {
    kind: 'message',
    messageId: data.messageId,
    role: data.role === 'user' ? 'user' : 'luna',
    messageIndex: data.messageIndex,
    excerpt: data.excerpt,
    fullText: data.fullText ?? data.excerpt,
  };
}

function toChatMessage(id: string, data: FirestoreMessageDoc): ChatMessage | null {
  const role = normalizeRole(data.role);
  if (!role) return null;

  const msg: ChatMessage = {
    id,
    role,
    text: data.text ?? '',
    transcript: data.transcript,
    reference: toThreadReference(data.reference),
    attachments: data.attachments?.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      size: a.size,
      mime: a.mime,
      uri: a.uri,
    })),
  };
  if (data.audioDurationMs != null && data.audioDurationMs > 0) {
    msg.audio = { uri: data.audioUrl ?? '', durationMs: data.audioDurationMs };
  }
  return msg;
}

function legacyMessageToChatMessage(raw: LegacyEmbeddedMessage, index: number): ChatMessage | null {
  const role = normalizeRole(raw.role);
  if (!role) return null;

  const msg: ChatMessage = {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `legacy-${index}`,
    role,
    text: typeof raw.text === 'string' ? raw.text : '',
    transcript: raw.transcript,
  };
  if (raw.audioDurationMs != null && raw.audioDurationMs > 0) {
    msg.audio = { uri: '', durationMs: raw.audioDurationMs };
  }
  return msg;
}

function messagesFromLegacyDoc(data: FirestoreConversationDoc | undefined): ChatMessage[] {
  if (!data?.messages || !Array.isArray(data.messages)) return [];
  return data.messages
    .map((m, i) => legacyMessageToChatMessage(m, i))
    .filter((m): m is ChatMessage => m != null);
}

function previewFromConversation(data: FirestoreConversationDoc): string {
  if (data.preview?.trim()) return data.preview.trim();

  const embedded = messagesFromLegacyDoc(data);
  if (embedded.length === 0) return '';

  const last = embedded[embedded.length - 1];
  const text = last.text?.trim() || last.transcript?.trim() || '';
  if (!text && last.attachments?.length) {
    const names = last.attachments.map((a) => a.name).join(', ');
    return names.length > 120 ? `${names.slice(0, 117)}…` : names;
  }
  if (!text) return last.audio ? 'Mensagem de voz' : '';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function mapConversationToSession(id: string, data: FirestoreConversationDoc): SessionItem {
  const updated = toDate(data.updatedAt ?? data.createdAt);
  return {
    id,
    title: data.title?.trim() || 'Conversa',
    preview: previewFromConversation(data),
    updatedAt: formatRelativeTime(updated),
  };
}

export function subscribeConversations(
  uid: string,
  onChange: (sessions: SessionItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const col = collection(db, `${userDoc(uid)}/conversations`);
  const q = query(col, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const sessions = snap.docs
        .filter((d) => !(d.data() as FirestoreConversationDoc).deletedAt)
        .map((d) =>
          mapConversationToSession(d.id, d.data() as FirestoreConversationDoc),
        );
      onChange(sessions);
    },
    (err) => onError?.(err),
  );
}

export function subscribeMessages(
  uid: string,
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange([]);
    return () => {};
  }

  let subcollectionMessages: ChatMessage[] = [];
  let legacyMessages: ChatMessage[] = [];
  let deletedIds = new Set<string>();

  const withoutDeleted = (msgs: ChatMessage[]) =>
    deletedIds.size === 0 ? msgs : msgs.filter((m) => !deletedIds.has(m.id));

  const emit = () => {
    const legacy = withoutDeleted(legacyMessages);
    const sub = withoutDeleted(subcollectionMessages);

    if (sub.length === 0) {
      onChange(legacy);
      return;
    }
    if (legacy.length === 0) {
      onChange(sub);
      return;
    }
    // Conversa legacy + mensagens novas escritas pelo mobile (subcollection)
    const seen = new Set(legacy.map((m) => m.id));
    const appended = sub.filter((m) => !seen.has(m.id));
    onChange([...legacy, ...appended]);
  };

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const unsubDoc = onSnapshot(
    convRef,
    (snap) => {
      const data = snap.exists() ? (snap.data() as FirestoreConversationDoc) : undefined;
      legacyMessages = messagesFromLegacyDoc(data);
      const raw = data?.deletedMessageIds;
      deletedIds = new Set(
        Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [],
      );
      emit();
    },
    (err) => onError?.(err),
  );

  const col = collection(db, userConversationMessagesCol(uid, conversationId));
  const q = query(col, orderBy('createdAt', 'asc'));

  const unsubCol = onSnapshot(
    q,
    (snap) => {
      subcollectionMessages = snap.docs
        .map((d) => toChatMessage(d.id, d.data() as FirestoreMessageDoc))
        .filter((m): m is ChatMessage => m != null);
      emit();
    },
    (err) => onError?.(err),
  );

  return () => {
    unsubDoc();
    unsubCol();
  };
}

export async function writeLunaTextMessage(
  uid: string,
  conversationId: string,
  messageId: string,
  text: string,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const msgRef = doc(db, `${userConversationMessagesCol(uid, conversationId)}/${messageId}`);

  await setDoc(
    convRef,
    {
      preview: text.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(msgRef, {
    role: 'luna',
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function writeUserTextMessage(
  uid: string,
  conversationId: string,
  messageId: string,
  displayText: string,
  reference?: ThreadReference,
  attachments?: ChatMessage['attachments'],
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const msgRef = doc(db, `${userConversationMessagesCol(uid, conversationId)}/${messageId}`);
  const previewSource = displayText.trim() || reference?.excerpt || '';
  const title = deriveTitle(previewSource);
  const preview = previewSource.slice(0, 120);

  await setDoc(
    convRef,
    {
      title,
      preview,
      lunaSessaoId: conversationId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(msgRef, {
    role: 'user',
    text: displayText.trim(),
    ...(attachments?.length
      ? {
          attachments: attachments.map(({ id, kind, name, size, mime, uri }) => ({
            id,
            kind,
            name,
            size,
            mime,
            ...(uri ? { uri } : {}),
          })),
        }
      : {}),
    ...(reference
      ? {
          reference: {
            kind: reference.kind,
            messageId: reference.messageId,
            role: reference.role,
            messageIndex: reference.messageIndex,
            excerpt: reference.excerpt,
            fullText: reference.fullText,
            ...(reference.kind === 'document'
              ? {
                  attachmentId: reference.attachmentId,
                  attachmentName: reference.attachmentName,
                  ...(reference.attachmentUri ? { attachmentUri: reference.attachmentUri } : {}),
                }
              : {}),
          },
        }
      : {}),
    createdAt: serverTimestamp(),
  });
}

export async function writeUserVoiceMessage(
  uid: string,
  conversationId: string,
  messageId: string,
  clip: VoiceClip,
  placeholderText: string,
  reference?: ThreadReference,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const msgRef = doc(db, `${userConversationMessagesCol(uid, conversationId)}/${messageId}`);
  const title = deriveTitle(placeholderText);

  await setDoc(
    convRef,
    {
      title,
      preview: placeholderText.slice(0, 120),
      lunaSessaoId: conversationId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(msgRef, {
    role: 'user',
    text: placeholderText,
    audioDurationMs: clip.durationMs,
    ...(clip.uri ? { audioUrl: clip.uri } : {}),
    ...(reference
      ? {
          reference: {
            kind: reference.kind,
            messageId: reference.messageId,
            role: reference.role,
            messageIndex: reference.messageIndex,
            excerpt: reference.excerpt,
            fullText: reference.fullText,
            ...(reference.kind === 'document'
              ? {
                  attachmentId: reference.attachmentId,
                  attachmentName: reference.attachmentName,
                  ...(reference.attachmentUri ? { attachmentUri: reference.attachmentUri } : {}),
                }
              : {}),
          },
        }
      : {}),
    createdAt: serverTimestamp(),
  });
}

/** Atualiza transcrição de uma mensagem de voz (só no cliente). */
export async function updateMessageTranscript(
  uid: string,
  conversationId: string,
  messageId: string,
  transcript: string,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const msgRef = doc(db, `${userConversationMessagesCol(uid, conversationId)}/${messageId}`);
  await setDoc(msgRef, { transcript }, { merge: true });
}

/** Garante documento de usuário (regra create exige plan free). */
export async function ensureUserProfile(user: import('firebase/auth').User): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const ref = doc(db, userDoc(user.uid));
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);

  const patch = {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...patch,
      plan: 'free',
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, patch, { merge: true });
  }
}

export async function fetchConversationTitle(
  uid: string,
  conversationId: string,
): Promise<string> {
  const db = getLunaFirestore();
  if (!db) return 'Luna';

  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, userConversationDoc(uid, conversationId)));
  if (!snap.exists()) return 'Luna';
  const data = snap.data() as FirestoreConversationDoc;
  return data.title?.trim() || 'Luna';
}

export { deriveTitle };
