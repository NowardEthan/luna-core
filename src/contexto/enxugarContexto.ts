import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

/** Quantos fatos do usuário sobrevivem ao turno simples — o suficiente para lembrar. */
const MAX_FATOS_SIMPLES = 8;

/**
 * M2 / L2 — Dieta do simples: tira blocos pesados do contexto da sessão.
 *
 * Mantém `historico` (continuidade) e fatos recentes do usuário.
 * Zera sense, ambiente e memórias longas — o briefing mínimo
 * (`entradasCompiladorSimples`) não deve carregá-los.
 */
export function enxugarContextoParaSimples(contexto: ContextoSessao): ContextoSessao {
  return {
    ...contexto,
    fatos: contexto.fatos.slice(-MAX_FATOS_SIMPLES),
    pendente_confirmacao: undefined,
    contexto_ambiente: undefined,
    contexto_sense: undefined,
    memorias_longas: undefined,
  };
}
