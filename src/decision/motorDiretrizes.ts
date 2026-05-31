import type { AnaliseContexto, Diretriz } from "../analyzers/esquema.js";
import { buscarDiretriz } from "../constitution/carregador.js";
import { chavesModificadores } from "./etiquetas.js";

export type PontuacaoDiretriz = {
  id: string;
  pontuacao: number;
  peso_base: number;
  modificadores_aplicados: Record<string, number>;
  ativa: boolean;
  motivo?: string;
};

function calcularPontuacao(diretriz: Diretriz, analise: AnaliseContexto): PontuacaoDiretriz {
  const peso_base = diretriz.peso_base ?? 0;
  const modificadores_aplicados: Record<string, number> = {};
  let pontuacao = peso_base;

  for (const chave of chavesModificadores(analise)) {
    const mod = diretriz.modificadores_contextuais?.[chave];
    if (mod !== undefined) {
      modificadores_aplicados[chave] = mod;
      pontuacao += mod;
    }
  }

  return {
    id: diretriz.id,
    pontuacao: Math.max(0, Math.min(150, pontuacao)),
    peso_base,
    modificadores_aplicados,
    ativa: true,
  };
}

function prioridadeCategoria(categoria: string): number {
  if (categoria === "seguranca" || categoria === "privacidade" || categoria === "autonomia") {
    return 3;
  }
  if (categoria === "identidade") return 2;
  if (categoria === "expressao") return 1;
  return 0;
}

function escolherVencedorConflito(
  a: PontuacaoDiretriz,
  dirA: Diretriz,
  b: PontuacaoDiretriz,
  dirB: Diretriz,
): PontuacaoDiretriz {
  if (dirA.regra_absoluta && !dirB.regra_absoluta) return a;
  if (dirB.regra_absoluta && !dirA.regra_absoluta) return b;
  if (a.pontuacao !== b.pontuacao) return a.pontuacao > b.pontuacao ? a : b;

  const prioA = prioridadeCategoria(dirA.categoria);
  const prioB = prioridadeCategoria(dirB.categoria);
  return prioA >= prioB ? a : b;
}

function resolverConflitos(
  pontuacoes: PontuacaoDiretriz[],
  diretrizes: Diretriz[],
): PontuacaoDiretriz[] {
  const mapa = new Map(diretrizes.map((d) => [d.id, d]));
  const resultado = pontuacoes.map((p) => ({ ...p }));

  for (const atual of resultado) {
    if (!atual.ativa) continue;

    const dir = mapa.get(atual.id);
    if (!dir?.conflita_com?.length) continue;

    for (const conflitoId of dir.conflita_com) {
      const outro = resultado.find((p) => p.id === conflitoId);
      if (!outro?.ativa) continue;

      const outroDir = mapa.get(conflitoId);
      if (!outroDir) continue;

      const vencedor = escolherVencedorConflito(atual, dir, outro, outroDir);

      if (vencedor.id === atual.id) {
        outro.ativa = false;
        outro.motivo = `Conflito: perdeu para ${atual.id} (${atual.pontuacao} vs ${outro.pontuacao})`;
      } else {
        atual.ativa = false;
        atual.motivo = `Conflito: perdeu para ${conflitoId} (${atual.pontuacao} vs ${outro.pontuacao})`;
        break;
      }
    }
  }

  return resultado;
}

/**
 * Motor de diretrizes — soma pesos e resolve conflitos (seção 6.5 da tese).
 */
export function pontuarDiretrizes(
  ids: string[],
  analise: AnaliseContexto,
): PontuacaoDiretriz[] {
  const diretrizes = ids
    .map((id) => buscarDiretriz(id))
    .filter((d): d is Diretriz => d !== undefined);

  const pontuacoes = diretrizes.map((d) => calcularPontuacao(d, analise));
  return resolverConflitos(pontuacoes, diretrizes);
}
