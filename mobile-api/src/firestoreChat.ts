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
  /** Mensagem enviada ao modelo (pode conter anexos enriquecidos). */
  userMessage: string;
  /**
   * Texto LIMPO do usuário para exibir/derivar título. Quando ausente, cai no
   * userMessage — evita vazar a análise de imagem/documento na bolha e no título.
   */
  userDisplayText?: string;
  lunaReply: string;
  userMessageId?: string;
  lunaMessageId?: string;
  humor_atual?: {
    emoji: string;
    label: string;
    tema: string;
    narrativa?: string;
    accessibilityLabel: string;
  };
};

export type AnexoVisualHistorico = {
  id: string;
  name?: string;
  mimeType?: string;
  url: string;
};

const MIME_VISUAL = /^(image|video)\//;

/**
 * Anexos visuais de turnos ANTERIORES da conversa.
 *
 * Sem isto, uma foto só existe no turno em que foi enviada: três mensagens depois a
 * Luna não tem como voltar nela ("aquela foto que te mandei"). Aqui devolvemos os
 * mais recentes para que ela possa chamar `ver_imagem` num anexo antigo quando quiser.
 *
 * Custo: só metadados (id/nome) entram no prompt. O arquivo em si só é buscado se ela
 * decidir olhar — então listar o histórico é barato.
 */
export async function carregarAnexosVisuaisRecentes(
  uid: string,
  sessionId: string,
  limite = 8,
): Promise<AnexoVisualHistorico[]> {
  const db = getAdminFirestore();
  if (!db) return [];

  try {
    const snap = await db
      .collection(`users/${uid}/conversations/${sessionId}/messages`)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const anexos: AnexoVisualHistorico[] = [];
    for (const doc of snap.docs) {
      const brutos = doc.data()?.attachments;
      if (!Array.isArray(brutos)) continue;
      for (const a of brutos) {
        const url = typeof a?.uri === "string" ? a.uri : "";
        const mime = typeof a?.mime === "string" ? a.mime : "";
        // Só o que dá para olhar: imagem/vídeo já no Storage (http). Um `file://`
        // do aparelho não serve — o servidor não alcança o disco do celular.
        if (!url.startsWith("http") || !MIME_VISUAL.test(mime)) continue;
        anexos.push({
          id: typeof a?.id === "string" ? a.id : `hist-${anexos.length + 1}`,
          name: typeof a?.name === "string" ? a.name : undefined,
          mimeType: mime,
          url,
        });
        if (anexos.length >= limite) return anexos;
      }
    }
    return anexos;
  } catch {
    return [];
  }
}

/** Grava turno de chat no Firestore (Admin SDK — ignora regras). Idempotente pelo lunaMessageId. */
export async function persistChatTurn(input: PersistChatTurnInput): Promise<boolean> {
  const db = getAdminFirestore();
  if (!db) return false;

  const { uid, sessionId, userMessage, lunaReply } = input;
  const displayText = (input.userDisplayText ?? userMessage).trim();
  const convRef = db.doc(`users/${uid}/conversations/${sessionId}`);
  const title = deriveTitle(displayText);
  const preview = lunaReply.trim().slice(0, 120) || displayText.slice(0, 120);

  // O par user+luna vai no MESMO batch, com o MESMO serverTimestamp — empata no `createdAt`.
  // O Firestore desempata por `__name__` (asc), então o id do «user» TEM de ordenar antes do da
  // «luna», senão a resposta aparece acima da pergunta (o «l-» antigo vinha antes do «u-»). O
  // sufixo `-0`/`-1` garante a ordem da troca quando o cliente não manda ids próprios.
  const baseTs = Date.now();
  const userMsgId = input.userMessageId ?? `m${baseTs}-0-user`;
  const lunaMsgId = input.lunaMessageId ?? `m${baseTs}-1-luna`;

  const userRef = convRef.collection("messages").doc(userMsgId);
  const lunaRef = convRef.collection("messages").doc(lunaMsgId);

  const lunaSnap = await lunaRef.get();
  if (lunaSnap.exists) {
    const existente = String(lunaSnap.data()?.text ?? "").trim();
    if (existente) return false;
  }

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

  batch.set(
    userRef,
    {
      role: "user",
      text: displayText,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    lunaRef,
    {
      role: "luna",
      text: lunaReply.trim(),
      ...(input.humor_atual ? { humor_atual: input.humor_atual } : {}),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  return true;
}
