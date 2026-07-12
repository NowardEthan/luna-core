import { getMessaging } from "firebase-admin/messaging";

import { getAdminFirestore } from "./firebaseAdmin.js";

/** Canal Android criado no app (ver src/lib/push/pushNotifications.ts). */
const LUNA_CHANNEL_ID = "luna";
const LUNA_COLOR = "#4B75F2";

function previewDaResposta(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

/**
 * Avisa o usuário que a Luna terminou de responder.
 *
 * Só é chamado quando o cliente **já se desconectou** no meio do stream (o usuário
 * saiu do app). A resposta em si já foi salva no Firestore — este push é apenas o
 * aviso. Best-effort: qualquer falha aqui é registrada e ignorada, nunca derruba
 * o turno.
 */
export async function notifyLunaReply(
  uid: string,
  sessionId: string,
  reply: string,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    if (!db) return;

    const snap = await db.doc(`users/${uid}`).get();
    const token = snap.data()?.pushToken;
    if (typeof token !== "string" || !token) return;

    const body = previewDaResposta(reply);
    if (!body) return;

    await getMessaging().send({
      token,
      notification: { title: "Luna respondeu", body },
      // O app usa o sessionId para abrir a conversa certa ao tocar.
      data: { sessionId },
      android: {
        priority: "high",
        notification: {
          channelId: LUNA_CHANNEL_ID,
          color: LUNA_COLOR,
        },
      },
    });
  } catch (err) {
    const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code;
    // Token morto (app desinstalado / reinstalado): limpa para não tentar de novo.
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      try {
        const db = getAdminFirestore();
        await db?.doc(`users/${uid}`).set({ pushToken: null }, { merge: true });
      } catch {
        /* ignora */
      }
      return;
    }
    console.warn("[push] falha ao notificar resposta da Luna:", err);
  }
}
