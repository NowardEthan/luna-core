/**
 * Calculador de Saliência — V1.6 (amígdala completa)
 *
 * A amígdala não só detecta ameaças: ela marca experiências com peso de
 * importância, tornando memórias significativas mais acessíveis na recuperação.
 * Este módulo é o equivalente computacional dessa função.
 *
 * Score final (0..1) combina três dimensões:
 *   - tipo_peso: quão intrinsecamente importante é esse tipo de informação
 *   - confirmacao_peso: quão explicitamente o usuário confirmou
 *   - sensibilidade_peso: sensibilidade + visibilidade de uso
 */

export type InputSaliencia = {
  tipo: string;
  sensibilidade: string;
  visibilidade_uso: string;
  fonte_confirmacao: string;
  confianca?: number;
  utilidade_futura?: "baixa" | "media" | "alta";
};

export type ComponentesSaliencia = {
  tipo_peso: number;
  confirmacao_peso: number;
  sensibilidade_peso: number;
  score: number;
};

const PESO_TIPO: Record<string, number> = {
  confirmacao_usuario: 0.95,
  informacao_sensivel: 0.9,
  preferencia: 0.75,
  fato_geral: 0.55,
  recall: 0.2,
  outro: 0.5,
};

const PESO_CONFIRMACAO: Record<string, number> = {
  confirmacao_usuario: 1.0,
  inferencia_confirmada: 0.8,
  import_manual: 0.75,
  inferencia_reflexao: 0.65,
};

const PESO_VISIBILIDADE: Record<string, number> = {
  nunca_mencionar_sem_confirmacao: 1.0,
  silenciosa: 0.9,
  mencionar_quando_relevante: 0.75,
  mencionar_se_perguntado: 0.6,
};

const PESO_SENSIBILIDADE: Record<string, number> = {
  sensivel: 1.0,
  pessoal: 0.75,
  normal: 0.5,
};

const BONUS_UTILIDADE: Record<string, number> = {
  alta: 0.1,
  media: 0.0,
  baixa: -0.15,
};

export function calcularSaliencia(input: InputSaliencia): ComponentesSaliencia {
  const tipo_peso = PESO_TIPO[input.tipo] ?? 0.5;
  const confirmacao_peso = PESO_CONFIRMACAO[input.fonte_confirmacao] ?? 0.7;

  const vis = PESO_VISIBILIDADE[input.visibilidade_uso] ?? 0.7;
  const sens = PESO_SENSIBILIDADE[input.sensibilidade] ?? 0.5;
  const sensibilidade_peso = (vis + sens) / 2;

  const bonus_confianca = input.confianca != null ? (input.confianca - 0.7) * 0.15 : 0;
  const bonus_utilidade = input.utilidade_futura ? (BONUS_UTILIDADE[input.utilidade_futura] ?? 0) : 0;

  const score = Math.min(
    1.0,
    Math.max(
      0.1,
      tipo_peso * 0.40 +
      confirmacao_peso * 0.35 +
      sensibilidade_peso * 0.25 +
      bonus_confianca +
      bonus_utilidade,
    ),
  );

  return { tipo_peso, confirmacao_peso, sensibilidade_peso, score };
}

/**
 * Combina cosine similarity e saliência em um score final de ranking.
 * A saliência atua como boost: memórias mais significativas sobem no ranking
 * mesmo quando a similaridade semântica é parecida.
 *
 *   score_final = cosine * 0.75 + saliencia * 0.25
 */
export function calcularScoreRetrieval(cosine: number, saliencia: number): number {
  return cosine * 0.75 + saliencia * 0.25;
}
