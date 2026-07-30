import { getAdminFirestore } from "./firebaseAdmin.js";

/**
 * A estante de documentos dele.
 *
 * Um documento NÃO é uma mensagem de chat: a mensagem dilui-se no fluxo, o documento fica.
 * Nasce da conversa — a Luna escreve um texto, um plano, um rascunho, uma auditoria — e passa
 * a viver aqui, num lugar próprio, para ser reaberto, lido e (nos próximos capítulos) editado.
 *
 * Fica em `users/{uid}/documentos`, ao lado da rotina e da caixa de ideias. `conversaId` guarda
 * de QUAL conversa ele nasceu — é isso que deixa o cartão aparecer no chat onde foi criado.
 */
export type Documento = {
  id: string;
  titulo: string;
  /** Corpo do documento, em Markdown. */
  conteudo: string;
  /** De qual conversa nasceu (sessão do chat). `null` quando criado fora de uma conversa. */
  conversaId: string | null;
  origem: "luna" | "user";
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
  /** Quem tocou por último — a Luna, numa auditoria/reescrita, ou o próprio Ethan. */
  updatedBy: "luna" | "user";
};

export type NovoDocumento = {
  titulo: string;
  conteudo: string;
  conversaId?: string | null;
  origem: "luna" | "user";
};

/**
 * Cria um documento na estante do usuário e devolve o id + o título (para a Luna confirmar).
 */
export async function criarDocumento(
  uid: string,
  dados: NovoDocumento,
): Promise<{ id: string; titulo: string }> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui guardar o documento.");
  const ref = db.collection("users").doc(uid).collection("documentos").doc();
  const agora = Date.now();
  const doc: Documento = {
    id: ref.id,
    titulo: dados.titulo,
    conteudo: dados.conteudo,
    conversaId: dados.conversaId ?? null,
    origem: dados.origem,
    createdAt: agora,
    updatedAt: agora,
    updatedBy: dados.origem,
  };
  await ref.set(doc);
  return { id: ref.id, titulo: doc.titulo };
}

/**
 * Lê todos os documentos do usuário, do mais recentemente mexido para o mais antigo.
 */
export async function lerDocumentos(uid: string): Promise<Documento[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const ref = db.collection("users").doc(uid).collection("documentos");
  const snap = await ref.orderBy("updatedAt", "desc").get();
  return snap.docs.map((d) => d.data() as Documento);
}
