import type { AnaliseContexto, Diretriz, SelecaoConstitucional } from "../analyzers/esquema.js";
import { listarDiretrizes } from "../constitution/carregador.js";
import { derivarEtiquetas } from "./etiquetas.js";

const LIMITE_DIRETRIZES = 12;

const DIRETRIZES_IDENTIDADE_BASE = [
  "identidade.manter_voz_luna",
  "identidade.manter_continuidade",
] as const;

function relevanciaDiretriz(diretriz: Diretriz, etiquetas: string[]): number {
  if (diretriz.imutavel) return 0;

  let score = diretriz.peso_base ?? 50;

  if (diretriz.aplica_quando?.length) {
    const intersecta = diretriz.aplica_quando.some((tag) => etiquetas.includes(tag));
    if (!intersecta) return 0;
    score += 30;
  }

  for (const tag of diretriz.etiquetas ?? []) {
    if (etiquetas.includes(tag)) score += 10;
  }

  for (const tag of etiquetas) {
    if (diretriz.modificadores_contextuais?.[tag] !== undefined) {
      score += 5;
    }
  }

  if (diretriz.categoria === "seguranca") {
    const temRisco = etiquetas.some(
      (e) => e.startsWith("nivel_risco_") || e === "acao_critica",
    );
    if (temRisco) score += 40;
  }

  if (diretriz.regra_absoluta) score += 1000;

  return score;
}

/**
 * Seletor constitucional rule-based — seção 6.8 da tese.
 */
export function selecionarDiretrizes(analise: AnaliseContexto): SelecaoConstitucional {
  const etiquetas = derivarEtiquetas(analise);
  const todas = listarDiretrizes().filter((d) => !d.imutavel);

  const ranqueadas = todas
    .map((d) => ({ id: d.id, score: relevanciaDiretriz(d, etiquetas) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const selecionadas = new Set<string>();

  for (const { id } of ranqueadas.slice(0, LIMITE_DIRETRIZES)) {
    selecionadas.add(id);
  }

  if (analise.confianca < 0.6) {
    for (const id of DIRETRIZES_IDENTIDADE_BASE) {
      selecionadas.add(id);
    }
  }

  for (const d of todas) {
    if (d.regra_absoluta) selecionadas.add(d.id);
  }

  if (analise.nivel_risco !== "nenhum") {
    for (const d of todas) {
      if (d.categoria === "seguranca" || d.etiquetas?.includes("seguranca")) {
        selecionadas.add(d.id);
      }
    }
  }

  return {
    diretrizes_selecionadas: [...selecionadas],
    analise: {
      intencao: analise.intencao,
      complexidade: analise.complexidade,
      risco: analise.nivel_risco,
    },
    confianca: analise.confianca,
  };
}
