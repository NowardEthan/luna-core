import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PoliticaDecisao } from "../analyzers/esquema.js";

type NivelFormato = PoliticaDecisao["nivel_formato_md"];

type GuiaFormatacaoMd = {
  objetivo: string;
  regras: string[];
  niveis: Record<"nenhum" | "leve" | "estruturado", string>;
  boas_praticas: {
    comandos: string;
    caminhos: string;
    tom: string;
  };
};

const arquivoAtual = fileURLToPath(import.meta.url);
const caminhoGuia = path.resolve(path.dirname(arquivoAtual), "../personalidade/guiaFormatacaoMd.json");

let guiaCache: GuiaFormatacaoMd | null = null;

function carregarGuiaFormatacaoMd(): GuiaFormatacaoMd {
  if (guiaCache) return guiaCache;
  const conteudo = readFileSync(caminhoGuia, "utf-8");
  guiaCache = JSON.parse(conteudo) as GuiaFormatacaoMd;
  return guiaCache;
}

function montarSliceNenhum(guia: GuiaFormatacaoMd): string {
  return [
    "Formato de saída: texto corrido, direto e sem markdown.",
    "Evite headings, bullets e blocos de código; responda em frases naturais.",
    `Objetivo: ${guia.objetivo}`,
    `Tom: ${guia.boas_praticas.tom}.`,
    "Se houver comando ou caminho, cite em crase sem estruturar em lista.",
  ].join("\n");
}

function montarSliceLeve(guia: GuiaFormatacaoMd): string {
  const regras = guia.regras.slice(0, 3).map((regra) => `- ${regra}`).join("\n");
  return [
    "Formato de saída: markdown leve, só quando melhorar leitura.",
    "Use no máximo um heading curto e poucos bullets objetivos.",
    "Evite aninhamento e ornamentação; preserve fluidez de conversa.",
    regras,
    `Boas práticas: ${guia.boas_praticas.comandos}; ${guia.boas_praticas.caminhos}.`,
  ].join("\n");
}

function montarSliceEstruturado(guia: GuiaFormatacaoMd): string {
  const regras = guia.regras.map((regra) => `- ${regra}`).join("\n");
  return [
    "Formato de saída: markdown estruturado para máxima legibilidade.",
    "Organize em seções curtas, listas claras e blocos de código quando útil.",
    "Cada bullet deve carregar uma ideia verificável e acionável.",
    regras,
    `Boas práticas: ${guia.boas_praticas.comandos}; ${guia.boas_praticas.caminhos}; ${guia.boas_praticas.tom}.`,
  ].join("\n");
}

export function montarSliceFormato(politica: Pick<PoliticaDecisao, "markdown_permitido" | "nivel_formato_md">): string {
  const guia = carregarGuiaFormatacaoMd();
  const nivel: NivelFormato =
    politica.markdown_permitido ? politica.nivel_formato_md ?? "leve" : "nenhum";

  if (nivel === "nenhum") return montarSliceNenhum(guia);
  if (nivel === "leve") return montarSliceLeve(guia);
  return montarSliceEstruturado(guia);
}
