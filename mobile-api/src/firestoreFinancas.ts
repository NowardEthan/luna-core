import { getAdminFirestore } from "./firebaseAdmin.js";

export type LancamentoFirestore = {
  id: string;
  tipo: "entrada" | "saida";
  valorCentavos: number;
  data: number;
  descricao: string;
  categoria: string;
  carteiraId: string;
  recorrenteId?: string | null;
  origem: "manual" | "luna" | "captura";
  pago: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CarteiraFirestore = {
  id: string;
  tipo: string;
  apelido: string;
  arquivada?: boolean;
};

function inicioDoDia(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Converte reais (number do LLM) pra centavos inteiros. */
export function reaisParaCentavos(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return -1;
  return Math.round(valor * 100);
}

export async function listarCarteiras(uid: string): Promise<CarteiraFirestore[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection("users").doc(uid).collection("carteiras").get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: (data.id as string) || d.id,
        tipo: String(data.tipo ?? "conta_debito"),
        apelido: String(data.apelido ?? ""),
        arquivada: Boolean(data.arquivada),
      } satisfies CarteiraFirestore;
    })
    .filter((c) => c.apelido && !c.arquivada);
}

export async function listarLancamentos(uid: string): Promise<LancamentoFirestore[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection("users").doc(uid).collection("lancamentos").get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      const tipo = data.tipo === "entrada" || data.tipo === "saida" ? data.tipo : null;
      if (!tipo) return null;
      const valor = Number(data.valorCentavos);
      if (!Number.isFinite(valor) || valor < 0) return null;
      const dataMs = Number(data.data);
      if (!Number.isFinite(dataMs)) return null;
      return {
        id: (data.id as string) || d.id,
        tipo,
        valorCentavos: valor,
        data: dataMs,
        descricao: String(data.descricao ?? ""),
        categoria: String(data.categoria ?? "outros"),
        carteiraId: String(data.carteiraId ?? ""),
        recorrenteId: (data.recorrenteId as string) ?? null,
        origem: (data.origem as LancamentoFirestore["origem"]) || "luna",
        pago: data.pago !== false,
        createdAt: Number(data.createdAt) || 0,
        updatedAt: Number(data.updatedAt) || 0,
      } satisfies LancamentoFirestore;
    })
    .filter((x): x is LancamentoFirestore => x !== null);
}

export async function criarLancamentoLuna(
  uid: string,
  dados: {
    tipo: "entrada" | "saida";
    valorCentavos: number;
    descricao: string;
    categoria: string;
    carteiraId: string;
    dataMs?: number;
    recorrenteId?: string | null;
  },
): Promise<string> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui guardar o lançamento.");
  const ref = db.collection("users").doc(uid).collection("lancamentos").doc();
  const agora = Date.now();
  const doc: LancamentoFirestore = {
    id: ref.id,
    tipo: dados.tipo,
    valorCentavos: dados.valorCentavos,
    data: inicioDoDia(dados.dataMs ?? agora),
    descricao: dados.descricao.trim() || (dados.tipo === "entrada" ? "Entrada" : "Saída"),
    categoria: dados.categoria,
    carteiraId: dados.carteiraId,
    recorrenteId: dados.recorrenteId ?? null,
    origem: "luna",
    pago: dados.tipo === "entrada",
    createdAt: agora,
    updatedAt: agora,
  };
  await ref.set(doc);
  return ref.id;
}

export function faixaPeriodo(
  periodo: "dia" | "semana" | "mes",
  agoraMs = Date.now(),
): { inicio: number; fim: number } {
  const d = new Date(agoraMs);
  d.setHours(0, 0, 0, 0);
  if (periodo === "dia") {
    const inicio = d.getTime();
    return { inicio, fim: inicio + 24 * 60 * 60 * 1000 };
  }
  if (periodo === "semana") {
    // Segunda-feira como início (igual ao Lab)
    const dia = d.getDay(); // 0=dom
    const desloc = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + desloc);
    const inicio = d.getTime();
    return { inicio, fim: inicio + 7 * 24 * 60 * 60 * 1000 };
  }
  d.setDate(1);
  const inicio = d.getTime();
  d.setMonth(d.getMonth() + 1);
  return { inicio, fim: d.getTime() };
}
