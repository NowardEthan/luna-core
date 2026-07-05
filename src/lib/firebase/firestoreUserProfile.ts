import {
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { getLunaFirestore } from './client';
import { userConversationDoc, userDoc } from './paths';
import type { FirestoreUserProfileDoc, UserProfileMilestones } from './userProfileTypes';

export function subscribeUserProfile(
  uid: string,
  onChange: (profile: FirestoreUserProfileDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getLunaFirestore();
  if (!db) {
    onChange(null);
    return () => {};
  }

  const ref = doc(db, userDoc(uid));
  return onSnapshot(
    ref,
    (snap) => onChange(snap.exists() ? (snap.data() as FirestoreUserProfileDoc) : null),
    (err) => onError?.(err),
  );
}

export async function updateUserProfileFields(
  uid: string,
  patch: Partial<
    Pick<FirestoreUserProfileDoc, 'bio' | 'displayName' | 'avatarUrl' | 'coverUrl' | 'photoURL'>
  >,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  await setDoc(
    doc(db, userDoc(uid)),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function mergeUserMilestones(
  uid: string,
  patch: UserProfileMilestones,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  const ref = doc(db, userDoc(uid));
  const snap = await getDoc(ref);
  const current = (snap.data()?.milestones ?? {}) as UserProfileMilestones;
  const next: UserProfileMilestones = { ...current };
  let changed = false;
  for (const [key, value] of Object.entries(patch) as [keyof UserProfileMilestones, boolean][]) {
    if (value && !next[key]) {
      next[key] = true;
      changed = true;
    }
  }
  if (!changed) return;

  await setDoc(ref, { milestones: next, updatedAt: serverTimestamp() }, { merge: true });
}

export async function toggleConversationPinned(
  uid: string,
  conversationId: string,
  pinned: boolean,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) throw new Error('Firebase não configurado.');

  await setDoc(
    doc(db, userConversationDoc(uid, conversationId)),
    { pinned, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Incrementa contador de mensagens no doc da conversa. */
export async function bumpConversationMessageCount(
  uid: string,
  conversationId: string,
  delta = 1,
): Promise<void> {
  const db = getLunaFirestore();
  if (!db) return;

  await setDoc(
    doc(db, userConversationDoc(uid, conversationId)),
    { messageCount: increment(delta), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
