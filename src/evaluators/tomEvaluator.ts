import type { AnaliseContexto, TomResposta } from "../analyzers/esquema.js";

export type ResultadoTom = {
  tom: TomResposta;
  motivos: string[];
};

/**
 * Avaliador de tom — mapeamento contextual (seção 6.11 da tese).
 */
export function avaliarTom(analise: AnaliseContexto, mensagem: string): ResultadoTom {
  const motivos: string[] = [];
  const humor = /\b(kk|haha|rs|😂|🤣|brincadeira)\b/i.test(mensagem);
  const riscoBaixo = analise.nivel_risco === "nenhum" || analise.nivel_risco === "baixo";

  if (humor && riscoBaixo) {
    motivos.push("Humor detectado + risco baixo → tom brincalhão");
    return { tom: "brincalhao", motivos };
  }

  const mapa: Partial<Record<AnaliseContexto["intencao"], TomResposta>> = {
    conversa_casual: analise.complexidade === "baixa" ? "casual" : "tecnico_acolhedor",
    pergunta_identitaria: "tecnico_acolhedor",
    pergunta_tecnica: "tecnico_acolhedor",
    pedido_codigo: "tecnico_acolhedor",
    projeto_arquitetural: "tecnico_acolhedor",
    apoio_emocional: "tecnico_acolhedor",
    acao_critica: "serio",
    brainstorm_criativo: "tecnico_acolhedor",
  };

  const tom = mapa[analise.intencao] ?? "tecnico_acolhedor";
  motivos.push(`Intenção ${analise.intencao} → tom ${tom}`);

  return { tom, motivos };
}
