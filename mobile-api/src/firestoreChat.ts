import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "./firebaseAdmin.js";

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "Nova conversa";
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

export type PersistChatTurnInput = {
  uid: string;
  sessionId: string;
  userMessage: string;
  lunaReply: string;
  userMessageId?: string;
  lunaMessageId?: string;
};

/** Grava turno de chat no Firestore (Admin SDK — ignora regras). */
export async function persistChatTurn(input: PersistChatTurnInput): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;

  const { uid, sessionId, userMessage, lunaReply } = input;
  const convRef = db.doc(`users/${uid}/conversations/${sessionId}`);
  const title = deriveTitle(userMessage);
  const preview = lunaReply.trim().slice(0, 120) || userMessage.trim().slice(0, 120);

  const batch = db.batch();

  batch.set(
    convRef,
    {
      title,
      preview,
      lunaSessaoId: sessionId,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const userMsgId = input.userMessageId ?? `u-${Date.now()}`;
  const lunaMsgId = input.lunaMessageId ?? `l-${Date.now()}`;

  const userRef = convRef.collection("messages").doc(userMsgId);
  const lunaRef = convRef.collection("messages").doc(lunaMsgId);

  batch.set(
    userRef,
    {
      role: "user",
      text: userMessage.trim(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(lunaRef, {
    role: "luna",
    text: lunaReply.trim(),
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}
