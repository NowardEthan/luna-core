import { getAdminFirestore } from "./firebaseAdmin.js";

export type TurnoCacheado = {
  text: string;
  humor_atual?: {
    emoji: string;
    label: string;
    tema: string;
    narrativa?: string;
    accessibilityLabel: string;
  };
};

/** Resposta já gravada — retry com o mesmo lunaMessageId não reprocessa o turno. */
export async function buscarTurnoCacheado(
  uid: string,
  sessionId: string,
  lunaMessageId: string | undefined,
): Promise<TurnoCacheado | null> {
  if (!lunaMessageId?.trim()) return null;

  const db = getAdminFirestore();
  if (!db) return null;

  const snap = await db
    .doc(`users/${uid}/conversations/${sessionId}/messages/${lunaMessageId}`)
    .get();

  if (!snap.exists) return null;

  const data = snap.data();
  if (data?.role !== "luna") return null;

  const text = String(data.text ?? "").trim();
  if (!text) return null;

  const humor = data.humor_atual;
  const humor_atual =
    humor &&
    typeof humor === "object" &&
    typeof (humor as Record<string, unknown>).emoji === "string"
      ? (humor as TurnoCacheado["humor_atual"])
      : undefined;

  return { text, humor_atual };
}
