import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

/**
 * M2 — Dieta do simples: tira blocos pesados (Sense/IDE), mantém presença e memória.
 */
export function enxugarContextoParaSimples(contexto: ContextoSessao): ContextoSessao {
  return {
    ...contexto,
    fatos: [],
    preferencias: {},
    pendente_confirmacao: undefined,
    contexto_ambiente: undefined,
    contexto_sense: undefined,
  };
}
