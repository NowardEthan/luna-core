import type { AnaliseContexto, Autonomia, NivelRisco } from "../analyzers/esquema.js";
import type { EstadoInterno } from "../estado/esquemaEstadoInterno.js";

export type ResultadoSeguranca = {
  nivel_seguranca: NivelRisco;
  autonomia_maxima: Autonomia;
  requer_confirmacao: boolean;
  bloquear: boolean;
  motivos: string[];
};

const MATRIZ_RISCO: Record<
  NivelRisco,
  Pick<ResultadoSeguranca, "autonomia_maxima" | "requer_confirmacao" | "bloquear">
> = {
  nenhum: { autonomia_maxima: "executar", requer_confirmacao: false, bloquear: false },
  baixo: { autonomia_maxima: "pedir_permissao", requer_confirmacao: false, bloquear: false },
  medio: { autonomia_maxima: "pedir_permissao", requer_confirmacao: true, bloquear: false },
  alto: { autonomia_maxima: "sugerir", requer_confirmacao: true, bloquear: true },
  critico: { autonomia_maxima: "nenhuma", requer_confirmacao: true, bloquear: true },
};

/**
 * Avaliador de segurança — matriz de risco (seção 6.10 da tese).
 * V2.1: aceita EstadoInterno para elevar threshold quando alerta_risco alto.
 */
export function avaliarSeguranca(
  analise: AnaliseContexto,
  estadoInterno?: EstadoInterno,
): ResultadoSeguranca {
  let nivel = analise.nivel_risco as NivelRisco;

  // V2.1 — alerta_risco alto → eleva sensibilidade da matriz
  if (estadoInterno && estadoInterno.alerta_risco >= 0.7) {
    if (nivel === "baixo") nivel = "medio";
    else if (nivel === "medio") nivel = "alto";
  }

  const linha = MATRIZ_RISCO[nivel];

  const motivos = [
    `Matriz de risco: ${nivel}`,
    `Autonomia máxima: ${linha.autonomia_maxima}`,
  ];

  if (linha.requer_confirmacao) motivos.push("Confirmação obrigatória");
  if (linha.bloquear) motivos.push("Bloqueio possível até permissão do Core");

  return {
    nivel_seguranca: nivel,
    autonomia_maxima: linha.autonomia_maxima,
    requer_confirmacao: linha.requer_confirmacao,
    bloquear: linha.bloquear,
    motivos,
  };
}
