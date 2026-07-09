import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ConversationFolder } from '../conversationOrganize/types';
import { getLunaFirestore } from './client';
import { userCollectionDoc, userCollectionsCol, userConversationDoc } from './paths';
import type { FirestoreCollectionDoc } from './types';

function mapFolder(id: string, data: FirestoreCollectionDoc): ConversationFolder {
  return {
    id,
    name: data.name?.trim() || 'Pasta',
    parentId: data.parentId ?? null,
  };
}

export function subscribeConversationFolders(
  uid: string,
  onChange: (folders: ConversationFolder[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const col = collection(db, userCollectionsCol(uid));
  const q = query(col, orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const folders = snap.docs.map((d) =>
        mapFolder(d.id, d.data() as FirestoreCollectionDoc),
      );
      onChange(folders);
    },
    (err) => onError?.(err),
  );
}

export async function createConversationFolder(
  uid: string,
  folderId: string,
  name: string,
  parentId?: string | null,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome da pasta vazio.');

  await setDoc(doc(db, userCollectionDoc(uid, folderId)), {
    name: trimmed,
    parentId: parentId ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function renameConversationFolder(
  uid: string,
  folderId: string,
  name: string,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome da pasta vazio.');

  await setDoc(
    doc(db, userCollectionDoc(uid, folderId)),
    { name: trimmed, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function updateConversationFolderParent(
  uid: string,
  folderId: string,
  parentId: string | null,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  await setDoc(
    doc(db, userCollectionDoc(uid, folderId)),
    { parentId: parentId ?? null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteConversationFolder(uid: string, folderId: string): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');
  await deleteDoc(doc(db, userCollectionDoc(uid, folderId)));
}

/** Move conversa para pasta (null = raiz). */
export async function moveConversationToFolder(
  uid: string,
  conversationId: string,
  collectionId: string | null,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  await setDoc(
    doc(db, userConversationDoc(uid, conversationId)),
    { collectionId: collectionId ?? null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Renomeia conversa e trava título automático. */
export async function updateConversationTitle(
  uid: string,
  conversationId: string,
  title: string,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  const trimmed = title.trim();
  if (!trimmed) throw new Error('Nome da conversa vazio.');

  await setDoc(
    doc(db, userConversationDoc(uid, conversationId)),
    { title: trimmed, titleLocked: true, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
