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
  banco?: string | null;
  cor?: string;
  ultimos4?: string | null;
  limiteCentavos?: number | null;
  fechamentoDia?: number | null;
  vencimentoDia?: number | null;
  saldoInicialCentavos?: number;
  arquivada?: boolean;
};

export type RecorrenteFirestore = {
  id: string;
  tipo: "entrada" | "saida";
  valorCentavos: number;
  diaDoMes: number;
  categoria: string;
  carteiraId: string;
  apelido: string;
  variavel: boolean;
  ativo: boolean;
};

export type TransferenciaFirestore = {
  id: string;
  deCarteiraId: string;
  paraCarteiraId: string;
  valorCentavos: number;
  data: number;
  motivo?: string | null;
  nota?: string | null;
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
        banco: typeof data.banco === "string" ? data.banco : null,
        cor: String(data.cor ?? "grafite"),
        ultimos4: typeof data.ultimos4 === "string" ? data.ultimos4 : null,
        limiteCentavos:
          typeof data.limiteCentavos === "number" ? data.limiteCentavos : null,
        fechamentoDia:
          typeof data.fechamentoDia === "number" ? data.fechamentoDia : null,
        vencimentoDia:
          typeof data.vencimentoDia === "number" ? data.vencimentoDia : null,
        saldoInicialCentavos:
          typeof data.saldoInicialCentavos === "number"
            ? data.saldoInicialCentavos
            : 0,
        arquivada: Boolean(data.arquivada),
      } satisfies CarteiraFirestore;
    })
    .filter((c) => c.apelido && !c.arquivada);
}

export async function criarCarteiraLuna(
  uid: string,
  dados: {
    tipo: string;
    apelido: string;
    banco?: string | null;
    cor?: string;
    ultimos4?: string | null;
    limiteCentavos?: number | null;
    fechamentoDia?: number | null;
    vencimentoDia?: number | null;
    saldoInicialCentavos?: number;
  },
): Promise<string> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível — não consegui criar a carteira.");
  const ref = db.collection("users").doc(uid).collection("carteiras").doc();
  const agora = Date.now();
  const tipo = dados.tipo;
  const doc: Record<string, unknown> = {
    id: ref.id,
    tipo,
    banco: dados.banco?.trim() || null,
    apelido: dados.apelido.trim(),
    cor: dados.cor ?? "grafite",
    ultimos4: dados.ultimos4?.trim() || null,
    saldoInicialCentavos: dados.saldoInicialCentavos ?? 0,
    arquivada: false,
    createdAt: agora,
    updatedAt: agora,
  };
  if (tipo === "cartao_credito") {
    doc.limiteCentavos = dados.limiteCentavos ?? null;
    doc.fechamentoDia = dados.fechamentoDia ?? null;
    doc.vencimentoDia = dados.vencimentoDia ?? null;
  } else {
    doc.limiteCentavos = null;
    doc.fechamentoDia = null;
    doc.vencimentoDia = null;
  }
  await ref.set(doc);
  return ref.id;
}

export async function atualizarCarteiraLuna(
  uid: string,
  id: string,
  patch: Partial<{
    tipo: string;
    apelido: string;
    banco: string | null;
    cor: string;
    ultimos4: string | null;
    limiteCentavos: number | null;
    fechamentoDia: number | null;
    vencimentoDia: number | null;
    saldoInicialCentavos: number;
  }>,
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível.");
  const ref = db.collection("users").doc(uid).collection("carteiras").doc(id);
  const existente = await ref.get();
  if (!existente.exists) throw new Error(`Carteira ${id} não encontrada.`);
  const data = existente.data() ?? {};
  const tipo = patch.tipo ?? String(data.tipo ?? "conta_debito");
  const update: Record<string, unknown> = {
    updatedAt: Date.now(),
  };
  if (patch.apelido !== undefined) update.apelido = patch.apelido.trim();
  if (patch.tipo !== undefined) update.tipo = patch.tipo;
  if (patch.banco !== undefined) update.banco = patch.banco?.trim() || null;
  if (patch.cor !== undefined) update.cor = patch.cor;
  if (patch.ultimos4 !== undefined) update.ultimos4 = patch.ultimos4?.trim() || null;
  if (patch.saldoInicialCentavos !== undefined) {
    update.saldoInicialCentavos = patch.saldoInicialCentavos;
  }
  if (tipo === "cartao_credito") {
    if (patch.limiteCentavos !== undefined) update.limiteCentavos = patch.limiteCentavos;
    if (patch.fechamentoDia !== undefined) update.fechamentoDia = patch.fechamentoDia;
    if (patch.vencimentoDia !== undefined) update.vencimentoDia = patch.vencimentoDia;
  } else if (patch.tipo !== undefined) {
    update.limiteCentavos = null;
    update.fechamentoDia = null;
    update.vencimentoDia = null;
  }
  await ref.set(update, { merge: true });
}

export async function arquivarCarteiraLuna(uid: string, id: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível.");
  await db
    .collection("users")
    .doc(uid)
    .collection("carteiras")
    .doc(id)
    .set({ arquivada: true, updatedAt: Date.now() }, { merge: true });
}

export async function listarLancamentos(uid: string): Promise<LancamentoFirestore[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection("users").doc(uid).collection("lancamentos").get();
  const out: LancamentoFirestore[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const tipo = data.tipo === "entrada" || data.tipo === "saida" ? data.tipo : null;
    if (!tipo) continue;
    const valor = Number(data.valorCentavos);
    if (!Number.isFinite(valor) || valor < 0) continue;
    const dataMs = Number(data.data);
    if (!Number.isFinite(dataMs)) continue;
    const origemRaw = data.origem;
    const origem: LancamentoFirestore["origem"] =
      origemRaw === "manual" || origemRaw === "luna" || origemRaw === "captura"
        ? origemRaw
        : "luna";
    out.push({
      id: (data.id as string) || d.id,
      tipo,
      valorCentavos: valor,
      data: dataMs,
      descricao: String(data.descricao ?? ""),
      categoria: String(data.categoria ?? "outros"),
      carteiraId: String(data.carteiraId ?? ""),
      recorrenteId: typeof data.recorrenteId === "string" ? data.recorrenteId : null,
      origem,
      pago: data.pago !== false,
      createdAt: Number(data.createdAt) || 0,
      updatedAt: Number(data.updatedAt) || 0,
    });
  }
  return out;
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
    /** Default true — «gastei» já aconteceu; contas a pagar usam recorrente. */
    pago?: boolean;
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
    pago: dados.pago ?? true,
    createdAt: agora,
    updatedAt: agora,
  };
  await ref.set(doc);
  return ref.id;
}

export async function listarRecorrentes(uid: string): Promise<RecorrenteFirestore[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection("users").doc(uid).collection("recorrentes").get();
  const out: RecorrenteFirestore[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const tipo = data.tipo === "entrada" || data.tipo === "saida" ? data.tipo : null;
    if (!tipo) continue;
    const valor = Number(data.valorCentavos);
    if (!Number.isFinite(valor) || valor < 0) continue;
    const dia = Number(data.diaDoMes);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) continue;
    const apelido = String(data.apelido ?? "").trim();
    const carteiraId = String(data.carteiraId ?? "");
    if (!apelido || !carteiraId) continue;
    out.push({
      id: (data.id as string) || d.id,
      tipo,
      valorCentavos: valor,
      diaDoMes: dia,
      categoria: String(data.categoria ?? "outros"),
      carteiraId,
      apelido,
      variavel: Boolean(data.variavel),
      ativo: data.ativo !== false,
    });
  }
  return out;
}

export async function criarRecorrenteLuna(
  uid: string,
  dados: {
    tipo: "entrada" | "saida";
    valorCentavos: number;
    diaDoMes: number;
    categoria: string;
    carteiraId: string;
    apelido: string;
    variavel?: boolean;
  },
): Promise<string> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível.");
  const ref = db.collection("users").doc(uid).collection("recorrentes").doc();
  const agora = Date.now();
  await ref.set({
    id: ref.id,
    tipo: dados.tipo,
    valorCentavos: dados.valorCentavos,
    diaDoMes: dados.diaDoMes,
    categoria: dados.categoria,
    carteiraId: dados.carteiraId,
    apelido: dados.apelido.trim(),
    variavel: Boolean(dados.variavel),
    ativo: true,
    createdAt: agora,
    updatedAt: agora,
  });
  return ref.id;
}

export async function atualizarRecorrenteLuna(
  uid: string,
  id: string,
  patch: Partial<{
    tipo: "entrada" | "saida";
    valorCentavos: number;
    diaDoMes: number;
    categoria: string;
    carteiraId: string;
    apelido: string;
    variavel: boolean;
    ativo: boolean;
  }>,
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível.");
  const ref = db.collection("users").doc(uid).collection("recorrentes").doc(id);
  const existente = await ref.get();
  if (!existente.exists) throw new Error(`Recorrente ${id} não encontrado.`);
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) update[k] = k === "apelido" && typeof v === "string" ? v.trim() : v;
  }
  await ref.set(update, { merge: true });
}

export async function criarTransferenciaLuna(
  uid: string,
  dados: {
    deCarteiraId: string;
    paraCarteiraId: string;
    valorCentavos: number;
    dataMs?: number;
    motivo?: string | null;
    nota?: string | null;
  },
): Promise<string> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore admin indisponível.");
  if (dados.deCarteiraId === dados.paraCarteiraId) {
    throw new Error("De e Para não podem ser a mesma carteira.");
  }
  if (dados.valorCentavos <= 0) throw new Error("Valor inválido.");
  const ref = db.collection("users").doc(uid).collection("transferencias").doc();
  const agora = Date.now();
  await ref.set({
    id: ref.id,
    deCarteiraId: dados.deCarteiraId,
    paraCarteiraId: dados.paraCarteiraId,
    valorCentavos: dados.valorCentavos,
    data: inicioDoDia(dados.dataMs ?? agora),
    motivo: dados.motivo ?? null,
    nota: dados.nota?.trim() || null,
    createdAt: agora,
    updatedAt: agora,
  });
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
