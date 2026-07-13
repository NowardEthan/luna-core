import { getAdminFirestore } from "./firebaseAdmin.js";

type TurnoRemoto = {
  papel: "user" | "assistant";
  conteudo: string;
  timestamp: string;
};

type LunaCoreCross = {
  prepararSessaoOrbit: (sessaoId: string) => { mensagens: unknown[] };
  buscarContextoOutrasSessoes: (
    mensagem: string,
    sessaoAtualId: string,
    maxSessoes?: number,
    opcoes?: { sempreAtivo?: boolean; owner_uid?: string },
  ) => string[];
  hidratarSessaoOrbit: (
    sessaoId: string,
    mensagens: TurnoRemoto[],
  ) => unknown;
};

function tokenizar(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2),
  );
}

const STOPWORDS = new Set([
  "voce",
  "você",
  "lembra",
  "lembr",
  "antes",
  "outra",
  "conversa",
  "disse",
  "falamos",
  "sobre",
  "isso",
  "sei",
  "ola",
  "oi",
  "boa",
  "noite",
  "dia",
  "tarde",
  "luna",
  "lunaaa",
  "the",
  "and",
  "que",
  "como",
  "para",
  "uma",
]);

function tokensRelevantes(mensagem: string): string[] {
  return [...tokenizar(mensagem)].filter((t) => !STOPWORDS.has(t) && t.length > 2);
}

function resumirTurnosFirestore(
  titulo: string,
  dataLabel: string,
  turnos: TurnoRemoto[],
  tokensBusca: string[] = [],
  maxTurnos = 10,
): string {
  if (!turnos.length) return "";

  const picked = new Set<number>();
  const add = (i: number) => {
    if (i >= 0 && i < turnos.length) picked.add(i);
  };

  add(0);
  const firstUser = turnos.findIndex((m) => m.papel === "user");
  if (firstUser >= 0) add(firstUser);

  for (let i = 0; i < turnos.length; i++) {
    const lower = turnos[i]!.conteudo.toLowerCase();
    if (tokensBusca.some((t) => lower.includes(t))) add(i);
  }

  for (let i = Math.max(0, turnos.length - maxTurnos); i < turnos.length; i++) {
    add(i);
  }

  const indices = [...picked].sort((a, b) => a - b);
  const linhas = indices.map((i) => {
    const m = turnos[i]!;
    const quem = m.papel === "user" ? "Usuário" : "Luna";
    const txt = m.conteudo.replace(/\s+/g, " ").trim().slice(0, 320);
    return `${quem}: ${txt}`;
  });

  return `[Conversa "${titulo}" · ${dataLabel}]\n${linhas.join("\n")}`;
}

function timestampIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

async function carregarMensagensFirestore(
  uid: string,
  sessionId: string,
): Promise<TurnoRemoto[]> {
  const db = getAdminFirestore();
  if (!db) return [];

  const snap = await db
    .collection(`users/${uid}/conversations/${sessionId}/messages`)
    .orderBy("createdAt", "asc")
    .limit(80)
    .get();

  const turnos: TurnoRemoto[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const role = data.role === "user" ? "user" : "assistant";
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) continue;
    turnos.push({
      papel: role,
      conteudo: text,
      timestamp: timestampIso(data.createdAt),
    });
  }
  return turnos;
}

type ConversaOutra = {
  id: string;
  titulo: string;
  dataLabel: string;
  turnos: TurnoRemoto[];
};

/**
 * Carrega as OUTRAS conversas do usuário (o trabalho caro: ~12 leituras Firestore).
 * Não escolhe nada — só traz o material. Quem escolhe é a pergunta, a cada turno.
 */
async function carregarOutrasConversas(
  uid: string,
  sessaoAtualId: string,
): Promise<ConversaOutra[]> {
  const db = getAdminFirestore();
  if (!db) return [];

  const convSnap = await db
    .collection(`users/${uid}/conversations`)
    .orderBy("updatedAt", "desc")
    .limit(12)
    .get();

  const conversas: ConversaOutra[] = [];
  for (const doc of convSnap.docs) {
    if (doc.id === sessaoAtualId) continue;

    const data = doc.data();
    const turnos = await carregarMensagensFirestore(uid, doc.id);
    if (turnos.filter((t) => t.papel === "user").length < 1) continue;

    conversas.push({
      id: doc.id,
      titulo:
        typeof data.title === "string" && data.title.trim()
          ? data.title.trim().slice(0, 60)
          : doc.id,
      dataLabel: timestampIso(data.updatedAt).slice(0, 10),
      turnos,
    });
  }
  return conversas;
}

/** Quantas palavras DESTA pergunta aparecem nesta conversa. */
function relevancia(conversa: ConversaOutra, tokensBusca: string[]): number {
  if (tokensBusca.length === 0) return 0;
  const texto = conversa.turnos.map((t) => t.conteudo).join(" ").toLowerCase();
  return tokensBusca.filter((t) => texto.includes(t)).length;
}

/**
 * Escolhe as conversas relevantes PARA ESTA MENSAGEM.
 *
 * Antes, a escolha era feita uma única vez por sessão e cacheada — com as palavras da
 * PRIMEIRA mensagem, que quase sempre é "oi luna" (só stopwords). Quando o Ethan
 * perguntava «lembra do que falei sobre X?», a busca por X nunca acontecia: a Luna já
 * tinha decidido do que lembrar antes de ele perguntar. Agora o material é cacheado (o
 * caro), mas a SELEÇÃO é refeita a cada turno, com a pergunta da vez.
 */
function selecionarRelevantes(
  conversas: ConversaOutra[],
  mensagem: string,
  maxSessoes: number,
): string[] {
  const tokensBusca = tokensRelevantes(mensagem);

  const ranqueadas = conversas
    .map((c) => ({ c, score: relevancia(c, tokensBusca) }))
    // Empate mantém a ordem original (mais recente primeiro) — sem pergunta útil
    // ("oi luna"), a conversa mais recente é o melhor palpite.
    .sort((a, b) => b.score - a.score);

  return ranqueadas
    .slice(0, maxSessoes)
    .map(({ c }) => resumirTurnosFirestore(c.titulo, c.dataLabel, c.turnos, tokensBusca))
    .filter((r) => r.length > 0);
}

function deduplicarResumos(resumos: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const r of resumos) {
    const chave = r.slice(0, 120);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(r);
  }
  return out;
}

/** Exposto só para os testes — a seleção é o coração do recall. */
export const __testes = { selecionarRelevantes };

export type PrepararMemoriaGlobalInput = {
  core: LunaCoreCross;
  uid: string | null;
  sessionId: string;
  mensagem: string;
  maxSessoes?: number;
};

export type PrepararMemoriaGlobalResult = {
  contextoCrossSessao: string[];
};

/**
 * Cache do MATERIAL, não da escolha.
 *
 * As outras conversas do usuário não mudam no meio de um papo — carregá-las uma vez por
 * sessão evita ~12 leituras Firestore por mensagem. Mas o que se cacheava antes eram os
 * RESUMOS JÁ ESCOLHIDOS, com as palavras da primeira mensagem: a memória ficava congelada
 * numa pergunta que ninguém fez. Agora guardamos as conversas cruas e escolhemos de novo
 * a cada turno — caro uma vez, certo sempre.
 */
const cacheOutrasConversas = new Map<string, ConversaOutra[]>();

/**
 * Prepara memória global: hidrata sessão actual a partir do Firestore e
 * recolhe trechos de outras conversas do mesmo utilizador.
 */
export async function prepararMemoriaGlobalMobile(
  input: PrepararMemoriaGlobalInput,
): Promise<PrepararMemoriaGlobalResult> {
  const { core, uid, sessionId, mensagem } = input;
  const maxSessoes = input.maxSessoes ?? 3;

  const sessaoLocal = core.prepararSessaoOrbit(sessionId);

  // `hidratarSessaoOrbit` só aplica o Firestore quando ele tem MAIS turnos
  // que o local (ver orbitIntegracao.ts) — ou seja, a partir do momento em
  // que a sessão já tem histórico local, essa leitura remota é sempre
  // descartada. Só vale a pena pagar o round-trip quando a sessão local
  // está mesmo vazia (instância nova do servidor, ou 1ª mensagem).
  if (uid && sessaoLocal.mensagens.length === 0) {
    try {
      const turnos = await carregarMensagensFirestore(uid, sessionId);
      if (turnos.length > 0) {
        core.hidratarSessaoOrbit(sessionId, turnos);
      }
    } catch {
      /* Firestore opcional — não bloqueia chat */
    }
  }

  const resumos: string[] = [];

  if (uid) {
    try {
      let conversas = cacheOutrasConversas.get(sessionId);
      if (!conversas) {
        conversas = await carregarOutrasConversas(uid, sessionId);
        cacheOutrasConversas.set(sessionId, conversas);
      }
      // A seleção é refeita a cada turno, com a pergunta DESTE turno.
      resumos.push(...selecionarRelevantes(conversas, mensagem, maxSessoes));
    } catch {
      /* ignora falha remota */
    }
  }

  if (resumos.length < maxSessoes) {
    const crossLocal =
      process.env.LUNA_CROSS_SESSION_LOCAL === "1" || process.env.LUNA_CROSS_SESSION_LOCAL === "true";
    if (crossLocal && uid) {
      try {
        const local = core.buscarContextoOutrasSessoes(mensagem, sessionId, maxSessoes, {
          sempreAtivo: true,
          owner_uid: uid,
        });
        resumos.push(...local);
      } catch {
        /* ignora falha local */
      }
    }
  }

  return {
    contextoCrossSessao: deduplicarResumos(resumos).slice(0, maxSessoes),
  };
}
