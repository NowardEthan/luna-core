import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ChatMessage, SessionItem } from '../../data/fixtures';
import { getLunaFirestore } from './client';
import { formatRelativeTime } from './formatRelativeTime';
import {
  userConversationDoc,
  userConversationMessagesCol,
  userConversationTrashCol,
  userConversationTrashDoc,
  userConversationTrashMessagesCol,
  userDoc,
  userMessageTrashCol,
} from './paths';
import type {
  FirestoreConversationDoc,
  FirestoreMessageDoc,
  FirestoreTrashConversationDoc,
  FirestoreTrashMessageDoc,
  LegacyEmbeddedMessage,
} from './types';

export interface TrashSessionItem extends SessionItem {
  deletedAtLabel: string;
  messageCount: number;
}

function normalizeRole(role: unknown): 'user' | 'luna' | null {
  if (role === 'user') return 'user';
  if (role === 'luna' || role === 'assistant') return 'luna';
  return null;
}

function toChatMessage(id: string, data: FirestoreMessageDoc): ChatMessage | null {
  const role = normalizeRole(data.role);
  if (!role) return null;
  const msg: ChatMessage = { id, role, text: data.text ?? '', transcript: data.transcript };
  if (data.audioDurationMs != null && data.audioDurationMs > 0) {
    msg.audio = { uri: data.audioUrl ?? '', durationMs: data.audioDurationMs };
  }
  if (data.attachments?.length) {
    msg.attachments = data.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      size: a.size,
      mime: a.mime,
      uri: a.uri,
    }));
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

function resolveLegacyId(raw: LegacyEmbeddedMessage, index: number): string {
  return typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `legacy-${index}`;
}

/** Remove mensagem do array legacy embutido (orbit-desktop). */
function removeLegacyMessage(
  messages: LegacyEmbeddedMessage[],
  targetId: string,
): LegacyEmbeddedMessage[] | null {
  if (messages.length === 0) return null;

  const resolved = messages.map((m, i) => ({ m, id: resolveLegacyId(m, i) }));
  if (resolved.some(({ id }) => id === targetId)) {
    return resolved.filter(({ id }) => id !== targetId).map(({ m }) => m);
  }

  if (messages.some((m) => m.id === targetId)) {
    return messages.filter((m) => m.id !== targetId);
  }

  const legacyIdx = /^legacy-(\d+)$/.exec(targetId);
  if (legacyIdx) {
    const idx = Number(legacyIdx[1]);
    if (idx >= 0 && idx < messages.length) {
      return messages.filter((_, i) => i !== idx);
    }
  }

  return null;
}

function messageTrashBackupEntry(message: ChatMessage): Record<string, unknown> {
  return {
    role: message.role,
    text: message.text ?? '',
    transcript: message.transcript ?? null,
    audioDurationMs: message.audio?.durationMs ?? null,
    deletedAt: Date.now(),
    originalMessageId: message.id,
  };
}

/** Grava backup no doc da conversa — funciona sem regras extra no Firestore. */
async function backupMessageOnConversationDoc(
  uid: string,
  conversationId: string,
  message: ChatMessage,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  await setDoc(
    convRef,
    {
      messageTrashBackup: {
        [message.id]: messageTrashBackupEntry(message),
      },
    },
    { merge: true },
  );
}

/** Tenta backup na subcollection messages_trash (requer regras deployadas). */
async function tryBackupMessageSubcollection(
  uid: string,
  conversationId: string,
  message: ChatMessage,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const trashRef = doc(db, `${userMessageTrashCol(uid, conversationId)}/${message.id}`);
  const payload: FirestoreTrashMessageDoc = {
    ...chatMessageToFirestoreDoc(message),
    originalMessageId: message.id,
    deletedAt: serverTimestamp() as FirestoreTrashMessageDoc['deletedAt'],
  };
  await setDoc(trashRef, payload);
}

function chatMessageToFirestoreDoc(msg: ChatMessage): FirestoreMessageDoc {
  const doc: FirestoreMessageDoc = {
    role: msg.role,
    text: msg.text ?? '',
    transcript: msg.transcript,
    createdAt: serverTimestamp() as FirestoreMessageDoc['createdAt'],
  };
  if (msg.audio?.durationMs) doc.audioDurationMs = msg.audio.durationMs;
  return doc;
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
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (value instanceof Date) return value;
  return new Date();
}

async function fetchAllSubcollectionMessages(
  uid: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  const db = getLunaFirestore();
  if (!db) return [];
  const col = collection(db, userConversationMessagesCol(uid, conversationId));
  const snap = await getDocs(query(col, orderBy('createdAt', 'asc')));
  return snap.docs
    .map((d) => toChatMessage(d.id, d.data() as FirestoreMessageDoc))
    .filter((m): m is ChatMessage => m != null);
}

/** Lê mensagens merged (legacy embutido + subcollection). */
export async function fetchConversationMessages(
  uid: string,
  conversationId: string,
): Promise<{ messages: ChatMessage[]; conversation: FirestoreConversationDoc | null }> {
  const db = getLunaFirestore();
  if (!db) return { messages: [], conversation: null };

  const convSnap = await getDoc(doc(db, userConversationDoc(uid, conversationId)));
  const convData = convSnap.exists()
    ? (convSnap.data() as FirestoreConversationDoc)
    : null;

  const legacy = messagesFromLegacyDoc(convData ?? undefined);
  const sub = await fetchAllSubcollectionMessages(uid, conversationId);

  if (sub.length === 0) return { messages: legacy, conversation: convData };

  if (legacy.length === 0) return { messages: sub, conversation: convData };

  const seen = new Set(legacy.map((m) => m.id));
  const appended = sub.filter((m) => !seen.has(m.id));
  return { messages: [...legacy, ...appended], conversation: convData };
}

async function deleteSubcollection(path: string, batchSize = 400): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const colRef = collection(db, path);
  let snap = await getDocs(query(colRef, limit(batchSize)));

  while (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < batchSize) break;
    snap = await getDocs(query(colRef, limit(batchSize)));
  }
}

async function copyMessagesToTrash(
  uid: string,
  conversationId: string,
  messages: ChatMessage[],
): Promise<void> {
  const db = getLunaFirestore();
  if (!db || messages.length === 0) return;

  const trashCol = userConversationTrashMessagesCol(uid, conversationId);
  const chunks: ChatMessage[][] = [];
  for (let i = 0; i < messages.length; i += 400) {
    chunks.push(messages.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const msg of chunk) {
      const ref = doc(db, `${trashCol}/${msg.id}`);
      const payload: FirestoreTrashMessageDoc = {
        ...chatMessageToFirestoreDoc(msg),
        originalMessageId: msg.id,
        deletedAt: serverTimestamp() as FirestoreTrashMessageDoc['deletedAt'],
      };
      batch.set(ref, payload);
    }
    await batch.commit();
  }
}

/** Move conversa para lixeira (soft delete no doc ativo). Nunca lança. */
export async function backupAndDeleteConversation(
  uid: string,
  conversationId: string,
): Promise<'deleted' | 'failed'> {
  const db = getLunaFirestore();
  if (!db) return 'failed';

  let messages: ChatMessage[] = [];
  let conversation: FirestoreConversationDoc | null = null;

  try {
    const fetched = await fetchConversationMessages(uid, conversationId);
    messages = fetched.messages;
    conversation = fetched.conversation;
  } catch {
    return 'failed';
  }

  const convRef = doc(db, userConversationDoc(uid, conversationId));

  try {
    await setDoc(
      convRef,
      {
        deletedAt: serverTimestamp(),
        messageCount: messages.length,
        title: conversation?.title ?? 'Conversa',
        preview: conversation?.preview ?? messages.at(-1)?.text?.slice(0, 120) ?? '',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    return 'failed';
  }

  try {
    const trashRef = doc(db, userConversationTrashDoc(uid, conversationId));
    const trashPayload: FirestoreTrashConversationDoc = {
      ...(conversation ?? {}),
      title: conversation?.title ?? 'Conversa',
      preview: conversation?.preview ?? '',
      originalConversationId: conversationId,
      messageCount: messages.length,
      deletedAt: serverTimestamp() as FirestoreTrashConversationDoc['deletedAt'],
      messages: conversation?.messages,
    };
    await setDoc(trashRef, trashPayload);
    await copyMessagesToTrash(uid, conversationId, messages);
  } catch {
    /* conversations_trash pode não ter regras deployadas */
  }

  return 'deleted';
}

/** Restaura conversa da lixeira. Nunca lança. */
export async function restoreConversationFromTrash(
  uid: string,
  conversationId: string,
): Promise<'restored' | 'not-found'> {
  const db = getLunaFirestore();
  if (!db) return 'not-found';

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const convSnap = await getDoc(convRef);

  if (convSnap.exists() && (convSnap.data() as FirestoreConversationDoc).deletedAt) {
    try {
      await updateDoc(convRef, {
        deletedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, userConversationTrashDoc(uid, conversationId))).catch(() => {});
      return 'restored';
    } catch {
      return 'not-found';
    }
  }

  const trashRef = doc(db, userConversationTrashDoc(uid, conversationId));
  const trashSnap = await getDoc(trashRef);
  if (!trashSnap.exists()) return 'not-found';

  try {
    const trashData = trashSnap.data() as FirestoreTrashConversationDoc;
    const { deletedAt: _d, originalConversationId: _o, messageCount: _c, ...convRest } = trashData;

    await setDoc(convRef, {
      ...convRest,
      deletedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });

    const trashMsgCol = collection(db, userConversationTrashMessagesCol(uid, conversationId));
    const trashMsgs = await getDocs(query(trashMsgCol, orderBy('createdAt', 'asc')));
    const liveCol = userConversationMessagesCol(uid, conversationId);

    if (trashMsgs.size > 0) {
      const chunks: typeof trashMsgs.docs[] = [];
      for (let i = 0; i < trashMsgs.docs.length; i += 400) {
        chunks.push(trashMsgs.docs.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const d of chunk) {
          const data = d.data() as FirestoreTrashMessageDoc;
          const { deletedAt: _td, originalMessageId, ...msgRest } = data;
          const msgId = originalMessageId || d.id;
          batch.set(doc(db, `${liveCol}/${msgId}`), msgRest);
        }
        await batch.commit();
      }
    } else if (trashData.messages?.length) {
      await updateDoc(convRef, { messages: trashData.messages });
    }

    await deleteSubcollection(userConversationTrashMessagesCol(uid, conversationId));
    await deleteDoc(trashRef);
    return 'restored';
  } catch {
    return 'not-found';
  }
}

/** Apaga mensagem da conversa ativa e grava backup (embedded + lixeira opcional). Nunca lança. */
export async function backupAndDeleteMessage(
  uid: string,
  conversationId: string,
  message: ChatMessage,
): Promise<'deleted' | 'not-found'> {
  const db = getLunaFirestore();
  if (!db) return 'not-found';

  let removed = false;
  const convRef = doc(db, userConversationDoc(uid, conversationId));

  try {
    const msgRef = doc(db, `${userConversationMessagesCol(uid, conversationId)}/${message.id}`);
    const msgSnap = await getDoc(msgRef);
    if (msgSnap.exists()) {
      await deleteDoc(msgRef);
      removed = true;
    }
  } catch {
    /* subcollection indisponível — tenta legacy/tombstone */
  }

  if (!removed) {
    try {
      const convSnap = await getDoc(convRef);
      if (convSnap.exists()) {
        const convData = convSnap.data() as FirestoreConversationDoc;
        if (convData.messages?.length) {
          const nextLegacy = removeLegacyMessage(convData.messages, message.id);
          if (nextLegacy) {
            await updateDoc(convRef, { messages: nextLegacy });
            removed = true;
          }
        }
      }
    } catch {
      /* array legacy grande ou offline — tombstone abaixo */
    }
  }

  // Tombstone: esconde a mensagem mesmo com duplicatas legacy+subcollection.
  try {
    await setDoc(
      convRef,
      { deletedMessageIds: arrayUnion(message.id) },
      { merge: true },
    );
    removed = true;
  } catch {
    if (!removed) return 'not-found';
  }

  try {
    await backupMessageOnConversationDoc(uid, conversationId, message);
  } catch {
    /* backup opcional */
  }

  try {
    await tryBackupMessageSubcollection(uid, conversationId, message);
  } catch {
    /* messages_trash pode não ter regras deployadas */
  }

  return 'deleted';
}

export function subscribeTrashConversations(
  uid: string,
  onChange: (items: TrashSessionItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange([]);
    return () => {};
  }

  // Soft delete no doc ativo — não depende de conversations_trash deployado.
  const col = collection(db, `${userDoc(uid)}/conversations`);
  const q = query(col, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const items: TrashSessionItem[] = snap.docs
        .filter((d) => !!(d.data() as FirestoreConversationDoc).deletedAt)
        .map((d) => {
          const data = d.data() as FirestoreConversationDoc;
          const deleted = toDate(data.deletedAt);
          return {
            id: d.id,
            title: data.title?.trim() || 'Conversa',
            preview: data.preview?.trim() || `${data.messageCount ?? 0} mensagens`,
            updatedAt: formatRelativeTime(deleted),
            deletedAtLabel: formatRelativeTime(deleted),
            messageCount: data.messageCount ?? 0,
          };
        });
      onChange(items);
    },
    (err) => onError?.(err),
  );
}

/** Apaga permanentemente da lixeira (sem restaurar). Nunca lança. */
export async function permanentlyDeleteFromTrash(
  uid: string,
  conversationId: string,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const convRef = doc(db, userConversationDoc(uid, conversationId));
  const convSnap = await getDoc(convRef);

  if (convSnap.exists() && (convSnap.data() as FirestoreConversationDoc).deletedAt) {
    try {
      await deleteSubcollection(userConversationMessagesCol(uid, conversationId));
      await deleteDoc(convRef);
    } catch {
      /* offline */
    }
  }

  try {
    await deleteSubcollection(userConversationTrashMessagesCol(uid, conversationId));
    await deleteDoc(doc(db, userConversationTrashDoc(uid, conversationId)));
  } catch {
    /* lixeira dedicada opcional */
  }
}
