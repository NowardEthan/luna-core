import { getAdminFirestore } from "./firebaseAdmin.js";

type TurnoRemoto = {
  papel: "user" | "assistant";
  conteudo: string;
  timestamp: string;
};

type LunaCoreCross = {
  prepararSessaoOrbit: (sessaoId: string) => unknown;
  buscarContextoOutrasSessoes: (
    mensagem: string,
    sessaoAtualId: string,
    maxSessoes?: number,
    opcoes?: { sempreAtivo?: boolean },
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

async function buscarContextoFirestore(
  uid: string,
  sessaoAtualId: string,
  mensagem: string,
  maxSessoes: number,
): Promise<string[]> {
  const db = getAdminFirestore();
  if (!db) return [];

  const convSnap = await db
    .collection(`users/${uid}/conversations`)
    .orderBy("updatedAt", "desc")
    .limit(12)
    .get();

  const tokensBusca = tokensRelevantes(mensagem);
  const resumos: string[] = [];

  for (const doc of convSnap.docs) {
    if (doc.id === sessaoAtualId) continue;
    if (resumos.length >= maxSessoes) break;

    const data = doc.data();
    const titulo =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim().slice(0, 60)
        : doc.id;
    const dataLabel = timestampIso(data.updatedAt).slice(0, 10);

    const turnos = await carregarMensagensFirestore(uid, doc.id);
    const userCount = turnos.filter((t) => t.papel === "user").length;
    if (userCount < 1) continue;

    const resumo = resumirTurnosFirestore(titulo, dataLabel, turnos, tokensBusca);
    if (resumo) resumos.push(resumo);
  }

  return resumos;
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
 * Prepara memória global: hidrata sessão actual a partir do Firestore e
 * recolhe trechos de outras conversas do mesmo utilizador.
 */
export async function prepararMemoriaGlobalMobile(
  input: PrepararMemoriaGlobalInput,
): Promise<PrepararMemoriaGlobalResult> {
  const { core, uid, sessionId, mensagem } = input;
  const maxSessoes = input.maxSessoes ?? 3;

  core.prepararSessaoOrbit(sessionId);

  if (uid) {
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
      const firestore = await buscarContextoFirestore(uid, sessionId, mensagem, maxSessoes);
      resumos.push(...firestore);
    } catch {
      /* ignora falha remota */
    }
  }

  if (resumos.length < maxSessoes) {
    try {
      const local = core.buscarContextoOutrasSessoes(mensagem, sessionId, maxSessoes, {
        sempreAtivo: true,
      });
      resumos.push(...local);
    } catch {
      /* ignora falha local */
    }
  }

  return {
    contextoCrossSessao: deduplicarResumos(resumos).slice(0, maxSessoes),
  };
}
