import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type GravidadeErroUx = "aviso" | "erro";

type RegraErroUx = {
  codigo: string;
  categoria: string;
  gravidade: GravidadeErroUx;
  mensagem: string;
  sugestao?: string;
  includes?: string[];
};

type GuiaFeedbackFalhas = {
  versao: string;
  fallback: RegraErroUx;
  regras: RegraErroUx[];
};

export type ErroUsuarioMapeado = {
  codigo: string;
  categoria: string;
  gravidade: GravidadeErroUx;
  mensagem: string;
  sugestao?: string;
  recuperavel: boolean;
  status?: number;
  quotaKind?: string;
  detalhe_tecnico?: string;
};

export type EventoErroUxSse = {
  error: string;
  code: string;
  category: string;
  severity: GravidadeErroUx;
  suggestion?: string;
  retryable: boolean;
  status?: number;
  quotaKind?: string;
};

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAMINHO_GUIA = join(RAIZ_PACOTE, "src", "personalidade", "guiaFeedbackFalhas.json");

let guiaCache: GuiaFeedbackFalhas | null = null;

function carregarGuia(): GuiaFeedbackFalhas {
  if (guiaCache) return guiaCache;
  guiaCache = JSON.parse(readFileSync(CAMINHO_GUIA, "utf-8")) as GuiaFeedbackFalhas;
  return guiaCache;
}

function textoSeguro(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor == null) return "";
  return String(valor);
}

function extrairMensagemErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object") {
    const record = erro as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return textoSeguro(erro);
}

function extrairStatus(erro: unknown): number | undefined {
  if (!erro || typeof erro !== "object") return undefined;
  const status = (erro as Record<string, unknown>).status;
  return typeof status === "number" ? status : undefined;
}

function extrairCodigo(erro: unknown): string | undefined {
  if (!erro || typeof erro !== "object") return undefined;
  const code = (erro as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function extrairQuotaKind(erro: unknown): string | undefined {
  if (!erro || typeof erro !== "object") return undefined;
  const quotaKind = (erro as Record<string, unknown>).quotaKind;
  return typeof quotaKind === "string" ? quotaKind : undefined;
}

function normalizarTexto(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escolherRegraQuota(quotaKind?: string): string {
  if (quotaKind === "images") return "quota_exceeded_images";
  if (quotaKind === "documents") return "quota_exceeded_documents";
  if (quotaKind === "voice") return "quota_exceeded_voice";
  return "quota_exceeded_messages";
}

function buscarRegraPorCodigo(codigo: string, guia: GuiaFeedbackFalhas): RegraErroUx | undefined {
  return guia.regras.find((regra) => regra.codigo === codigo);
}

function mapearRegra(regra: RegraErroUx, detalhes: {
  status?: number;
  quotaKind?: string;
  detalhe?: string;
}): ErroUsuarioMapeado {
  return {
    codigo: regra.codigo,
    categoria: regra.categoria,
    gravidade: regra.gravidade,
    mensagem: regra.mensagem,
    sugestao: regra.sugestao,
    recuperavel: regra.gravidade === "aviso",
    status: detalhes.status,
    quotaKind: detalhes.quotaKind,
    detalhe_tecnico: detalhes.detalhe,
  };
}

function escolherRegraPorTexto(textoNormalizado: string, guia: GuiaFeedbackFalhas): RegraErroUx | undefined {
  return guia.regras.find((regra) => {
    const includes = regra.includes ?? [];
    return includes.some((termo) => textoNormalizado.includes(normalizarTexto(termo)));
  });
}

export function mapearErroUsuario(erro: unknown): ErroUsuarioMapeado {
  const guia = carregarGuia();
  const detalhe = extrairMensagemErro(erro).trim();
  const status = extrairStatus(erro);
  const code = extrairCodigo(erro);
  const quotaKind = extrairQuotaKind(erro);
  const texto = normalizarTexto(detalhe);

  if (status === 429 || code === "quota_exceeded") {
    const regraQuota = buscarRegraPorCodigo(escolherRegraQuota(quotaKind), guia);
    if (regraQuota) return mapearRegra(regraQuota, { status, quotaKind, detalhe });
  }

  const regraDireta = code ? buscarRegraPorCodigo(code, guia) : undefined;
  if (regraDireta) return mapearRegra(regraDireta, { status, quotaKind, detalhe });

  const regraPorTexto = escolherRegraPorTexto(texto, guia);
  if (regraPorTexto) return mapearRegra(regraPorTexto, { status, quotaKind, detalhe });

  return mapearRegra(guia.fallback, { status, quotaKind, detalhe });
}

export function mapearErroParaEventoSse(erro: unknown): EventoErroUxSse {
  const mapped = mapearErroUsuario(erro);
  return {
    error: mapped.mensagem,
    code: mapped.codigo,
    category: mapped.categoria,
    severity: mapped.gravidade,
    suggestion: mapped.sugestao,
    retryable: mapped.recuperavel,
    status: mapped.status,
    quotaKind: mapped.quotaKind,
  };
}
