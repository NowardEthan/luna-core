import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

/** Quantos fatos do usuário sobrevivem ao turno simples — o suficiente para lembrar. */
const MAX_FATOS_SIMPLES = 8;

/**
 * M2 — Dieta do simples: tira os blocos PESADOS (Sense/IDE), mantém presença e memória.
 *
 * O `fatos: []` que estava aqui contradizia o próprio comentário: no turno simples — que
 * é o papo, onde o Ethan e a Luna realmente vivem — ela perdia TODOS os fatos sobre a
 * pessoa com quem estava falando. Esquecer quem é o outro justamente na conversa não é
 * dieta, é amnésia. Agora os fatos ficam (limitados, para não estourar o orçamento);
 * o que sai é só o que é de facto pesado e raramente relevante no papo.
 */
export function enxugarContextoParaSimples(contexto: ContextoSessao): ContextoSessao {
  return {
    ...contexto,
    fatos: contexto.fatos.slice(-MAX_FATOS_SIMPLES),
    pendente_confirmacao: undefined,
    contexto_ambiente: undefined,
    contexto_sense: undefined,
  };
}
