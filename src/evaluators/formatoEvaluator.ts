import type {
  AnaliseContexto,
  FormatoResposta,
  NivelFormatoMd,
} from "../analyzers/esquema.js";

export type ResultadoFormato = {
  formato: FormatoResposta;
  markdown_permitido: boolean;
  nivel_formato_md: NivelFormatoMd;
  motivos: string[];
};

/**
 * Avaliador de formato determinístico — seção 6.9 da tese.
 */
export function avaliarFormato(analise: AnaliseContexto): ResultadoFormato {
  const motivos: string[] = [];

  if (analise.requer_codigo) {
    motivos.push("Requer código → formato codigo, markdown permitido");
    return { formato: "codigo", markdown_permitido: true, nivel_formato_md: "estruturado", motivos };
  }

  if (analise.requer_markdown) {
    motivos.push("Requer markdown → formato markdown");
    return { formato: "markdown", markdown_permitido: true, nivel_formato_md: "leve", motivos };
  }

  if (analise.intencao === "conversa_casual" && analise.complexidade === "baixa") {
    motivos.push("Conversa casual de complexidade baixa → texto simples");
    return { formato: "texto_simples", markdown_permitido: false, nivel_formato_md: "nenhum", motivos };
  }

  if (analise.intencao === "pergunta_identitaria") {
    motivos.push("Pergunta identitária → texto simples, responder direto");
    return { formato: "texto_simples", markdown_permitido: false, nivel_formato_md: "nenhum", motivos };
  }

  if (analise.complexidade === "alta" && analise.intencao === "projeto_arquitetural") {
    motivos.push("Complexidade alta com projeto arquitetural → markdown útil");
    return { formato: "markdown", markdown_permitido: true, nivel_formato_md: "estruturado", motivos };
  }

  motivos.push("Padrão conservador → texto simples");
  return { formato: "texto_simples", markdown_permitido: false, nivel_formato_md: "nenhum", motivos };
}
