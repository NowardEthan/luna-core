/**
 * M2 — Dieta do simples: contexto enxuto para mensagens triviais.
 * Mantém histórico; remove blocos pesados que afogam a personalidade.
 */

import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

export function enxugarContextoParaSimples(contexto: ContextoSessao): ContextoSessao {
  return {
    historico: contexto.historico,
    fatos: [],
    preferencias: {},
    pendente_confirmacao: undefined,
    memorias_longas: undefined,
    contexto_ambiente: undefined,
    contexto_sense: undefined,
    contexto_presenca: undefined,
    ambiente_atual: undefined,
  };
}
