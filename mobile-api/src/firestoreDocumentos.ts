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

/**
 * Documentos nascidos de UMA conversa — é o que a Luna enxerga para saber o que pode ler/editar
 * ali. Filtra por igualdade (`conversaId`) e ordena no cliente, sem exigir índice composto.
 */
export async function lerDocumentosDaConversa(
  uid: string,
  conversaId: string,
): Promise<Documento[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const ref = db.collection("users").doc(uid).collection("documentos");
  const snap = await ref.where("conversaId", "==", conversaId).get();
  return snap.docs
    .map((d) => d.data() as Documento)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Esta conversa já tem ALGUM documento na estante? Checagem barata (`limit(1)`) para o pipeline
 * decidir baixar a régua do modo agêntico: numa conversa que já pariu um documento, um follow-up
 * como «escreve mais narrativo» É pedido de edição — mas não cita a palavra «documento», então o
 * detector estrito não o apanha e a Luna voltava a narrar «editei» sem chamar a ferramenta.
 */
export async function conversaTemDocumentos(
  uid: string,
  conversaId: string,
): Promise<boolean> {
  const db = getAdminFirestore();
  if (!db) return false;
  const ref = db.collection("users").doc(uid).collection("documentos");
  const snap = await ref.where("conversaId", "==", conversaId).limit(1).get();
  return !snap.empty;
}

/**
 * Lê um documento pelo id. `null` se não existe (id inventado / apagado).
 */
export async function lerDocumento(uid: string, id: string): Promise<Documento | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const ref = db.collection("users").doc(uid).collection("documentos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as Documento;
}

/**
 * Atualiza (reescreve) um documento — a mão da Luna numa auditoria/revisão. Só mexe no que veio
 * (título e/ou conteúdo), carimba `updatedAt` e marca quem tocou. Devolve `null` se o id não bate.
 */
export async function atualizarDocumento(
  uid: string,
  id: string,
  dados: { titulo?: string; conteudo?: string },
  updatedBy: "luna" | "user",
): Promise<{ id: string; titulo: string } | null> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui salvar o documento.");
  const ref = db.collection("users").doc(uid).collection("documentos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const atual = snap.data() as Documento;
  const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy };
  if (typeof dados.titulo === "string" && dados.titulo.trim()) patch.titulo = dados.titulo.trim();
  if (typeof dados.conteudo === "string") patch.conteudo = dados.conteudo;
  await ref.update(patch);
  return { id, titulo: (patch.titulo as string) ?? atual.titulo };
}
