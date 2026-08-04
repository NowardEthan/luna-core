import { getAdminFirestore } from "./firebaseAdmin.js";
import {
  SCHEMA_ARTEFATO_BLOCOS,
  SCHEMA_ARTEFATO_MD,
  blocosToMd,
  mdToBlocos,
  normalizarDocumentoBlocos,
  type BlocoArtefato,
} from "../../dist/ferramentas/artefatoBlocos.js";

/**
 * A estante de documentos dele.
 *
 * Um documento NÃO é uma mensagem de chat: a mensagem dilui-se no fluxo, o documento fica.
 * Nasce da conversa — a Luna escreve um texto, um plano, um rascunho, uma auditoria — e passa
 * a viver aqui, num lugar próprio, para ser reaberto, lido e (nos próximos capítulos) editado.
 *
 * Fica em `users/{uid}/documentos`, ao lado da rotina e da caixa de ideias. `conversaId` guarda
 * de QUAL conversa ele nasceu — é isso que deixa o cartão aparecer no chat onde foi criado.
 *
 * Schema v2 (Notion da Luna): `blocos` é a verdade; `conteudo` é projeção Markdown (export +
 * tools legadas). Docs antigos (sem schemaVersion / v1) convertem MD → blocos na leitura e
 * gravam v2 no próximo save.
 */
export type Documento = {
  id: string;
  titulo: string;
  /** Projeção Markdown do corpo (sempre coerente com `blocos` em schema ≥ 2). */
  conteudo: string;
  /** Lista ordenada de blocos tipados — verdade do documento em schema 2. */
  blocos?: BlocoArtefato[];
  /** 1 = MD legado; 2 = blocos. */
  schemaVersion?: number;
  /**
   * A «bíblia» do artefato: os fatos fixos que não podem se contradizer entre trechos (nomes,
   * idades, relações, decisões de mundo). É METADADO — fica FORA do corpo (não vaza na exportação
   * nem na contagem de palavras) e é injetado no contexto da Luna a cada turno pra ela não trocar
   * o nome de um personagem entre um capítulo e outro. Ausente/`""` = sem cânone ainda.
   */
  canone?: string;
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
  blocos?: BlocoArtefato[];
  conversaId?: string | null;
  origem: "luna" | "user";
};

function materializarCorpo(dados: {
  conteudo?: string;
  blocos?: BlocoArtefato[] | null;
  schemaVersion?: number | null;
}): { schemaVersion: number; blocos: BlocoArtefato[]; conteudo: string } {
  return normalizarDocumentoBlocos(dados);
}

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
  const corpo = materializarCorpo({
    conteudo: dados.conteudo,
    blocos: dados.blocos,
    schemaVersion: dados.blocos?.length ? SCHEMA_ARTEFATO_BLOCOS : SCHEMA_ARTEFATO_MD,
  });
  const doc: Documento = {
    id: ref.id,
    titulo: dados.titulo,
    conteudo: corpo.conteudo,
    blocos: corpo.blocos,
    schemaVersion: corpo.schemaVersion,
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
 * Docs legados (sem blocos) são normalizados em memória — a migração persistente ocorre no save.
 */
export async function lerDocumento(uid: string, id: string): Promise<Documento | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const ref = db.collection("users").doc(uid).collection("documentos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const bruto = snap.data() as Documento;
  const corpo = materializarCorpo({
    conteudo: bruto.conteudo,
    blocos: bruto.blocos,
    schemaVersion: bruto.schemaVersion,
  });
  return { ...bruto, ...corpo };
}

/**
 * Atualiza (reescreve) um documento — a mão da Luna numa auditoria/revisão. Só mexe no que veio
 * (título e/ou conteúdo/blocos), carimba `updatedAt` e marca quem tocou. Devolve `null` se o id não bate.
 *
 * Preferir `blocos` quando a edição é por bloco; `conteudo` sozinho re-parseia MD → blocos (ids novos).
 */
export async function atualizarDocumento(
  uid: string,
  id: string,
  dados: {
    titulo?: string;
    conteudo?: string;
    blocos?: BlocoArtefato[];
    canone?: string;
  },
  updatedBy: "luna" | "user",
): Promise<{ id: string; titulo: string } | null> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui salvar o documento.");
  const ref = db.collection("users").doc(uid).collection("documentos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const atual = snap.data() as Documento;

  let novoCorpo: { schemaVersion: number; blocos: BlocoArtefato[]; conteudo: string } | null = null;
  if (Array.isArray(dados.blocos)) {
    novoCorpo = {
      schemaVersion: SCHEMA_ARTEFATO_BLOCOS,
      blocos: dados.blocos,
      conteudo: blocosToMd(dados.blocos),
    };
  } else if (typeof dados.conteudo === "string") {
    // Reescrita MD: parseia de novo (ids novos). Aceitável em editar_artefato / editar_trecho.
    novoCorpo = {
      schemaVersion: SCHEMA_ARTEFATO_BLOCOS,
      blocos: mdToBlocos(dados.conteudo),
      conteudo: dados.conteudo.endsWith("\n") ? dados.conteudo : `${dados.conteudo}\n`,
    };
    // Mantém projeção canônica a partir dos blocos (normaliza whitespace).
    novoCorpo.conteudo = blocosToMd(novoCorpo.blocos);
  }

  const mudouCorpo =
    novoCorpo != null &&
    (novoCorpo.conteudo !== (atual.conteudo ?? "") ||
      JSON.stringify(novoCorpo.blocos) !== JSON.stringify(atual.blocos ?? []));

  // Antes de sobrescrever, guarda um RETRATO do estado atual em `versoes` — a rede de segurança
  // pra quando a Luna reescreve por cima e o Ethan quer o texto de volta. Só quando o CORPO muda
  // de fato (renome de título não gera versão) e havia conteúdo. O app lê essa subcoleção no
  // «Histórico»; as regras do Firestore precisam liberar a subcoleção à parte (não herdam).
  if (mudouCorpo && (atual.conteudo?.trim() || (atual.blocos?.length ?? 0) > 0)) {
    const atualNorm = materializarCorpo({
      conteudo: atual.conteudo,
      blocos: atual.blocos,
      schemaVersion: atual.schemaVersion,
    });
    await ref.collection("versoes").add({
      titulo: atual.titulo,
      conteudo: atualNorm.conteudo,
      blocos: atualNorm.blocos,
      schemaVersion: atualNorm.schemaVersion,
      savedAt: atual.updatedAt,
      autor: atual.updatedBy,
    });
  }

  const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy };
  if (typeof dados.titulo === "string" && dados.titulo.trim()) patch.titulo = dados.titulo.trim();
  if (novoCorpo) {
    patch.conteudo = novoCorpo.conteudo;
    patch.blocos = novoCorpo.blocos;
    patch.schemaVersion = novoCorpo.schemaVersion;
  }
  // Cânone é metadado independente do corpo — não gera versão (o snapshot acima só olha o corpo).
  if (typeof dados.canone === "string") patch.canone = dados.canone;
  await ref.update(patch);
  return { id, titulo: (patch.titulo as string) ?? atual.titulo };
}

export { SCHEMA_ARTEFATO_BLOCOS, SCHEMA_ARTEFATO_MD };
export type { BlocoArtefato };
