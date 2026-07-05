import type { DefinicaoFerramenta } from "../providers/tipos.js";

/**
 * Ferramentas permitidas no chat mobile.
 * Não inclui ações destrutivas do agente IDE.
 */
export const FERRAMENTAS_CHAT: DefinicaoFerramenta[] = [
  {
    nome: "consultar_atlas",
    descricao:
      "Consulta o Atlas interno da Luna para recuperar contexto factual do projeto e arquitetura.",
    parametros: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description: "Consulta textual para buscar no Atlas.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de itens (entre 3 e 5).",
        },
      },
      required: ["consulta"],
    },
  },
  {
    nome: "ver_imagem",
    descricao:
      "Analisa imagens anexadas para responder perguntas visuais, OCR e contexto visual.",
    parametros: {
      type: "object",
      properties: {
        imagem_id: {
          type: "string",
          description: "ID do anexo. Se omitido, usa a imagem mais recente.",
        },
        pergunta: {
          type: "string",
          description: "Pergunta focada para orientar a análise visual.",
        },
      },
      required: [],
    },
  },
];
