import type { DefinicaoFerramenta } from "../providers/tipos.js";
import { webSearchDisponivel } from "./pesquisaWeb.js";

const FERRAMENTAS_BASE: DefinicaoFerramenta[] = [
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
      "Olha imagens E vídeos anexados: responde perguntas visuais, lê texto (OCR) e descreve o que acontece num vídeo. " +
      "Faz uma pergunta focada e recebe a resposta — pode chamar de novo com outra pergunta se precisares de mais detalhe.",
    parametros: {
      type: "object",
      properties: {
        imagem_id: {
          type: "string",
          description: "ID do anexo (imagem ou vídeo). Se omitido, usa o mais recente.",
        },
        pergunta: {
          type: "string",
          description:
            "Pergunta focada — ex.: «qual o placar no canto superior?», «o que está escrito na caneca?», «o que acontece no vídeo?».",
        },
      },
      required: [],
    },
  },
  {
    nome: "ler_arquivo",
    descricao:
      "Lê documentos anexados (PDF, DOCX, MD, TXT...). Do outro lado há alguém que leu o arquivo inteiro: " +
      "chama SEM argumentos para receber o mapa (quantas partes, o sumário); com `pergunta` para receber a resposta " +
      "com a parte citada; com `parte` para ler o texto cru de um pedaço. " +
      "Um arquivo grande NÃO cabe de uma vez — vais lendo o que precisas, e podes chamar de novo quantas vezes quiseres.",
    parametros: {
      type: "object",
      properties: {
        arquivo_id: {
          type: "string",
          description: "ID do documento. Se omitido, usa o mais recente.",
        },
        pergunta: {
          type: "string",
          description:
            "O que queres saber — ex.: «do que trata este documento?», «o que ele diz sobre sentimentos?», «resume o capítulo 3».",
        },
        parte: {
          type: "number",
          description: "Ler o texto cru de uma parte específica (1, 2, 3...). Vê o mapa primeiro.",
        },
      },
      required: [],
    },
  },
];

const FERRAMENTA_WEB_SEARCH: DefinicaoFerramenta = {
  nome: "web_search",
  descricao:
    "Pesquisa na web informação actual (notícias, preços, eventos, factos recentes). Usa o ano actual na query quando pedirem «hoje» ou «recente».",
  parametros: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Consulta em português; para notícias recentes inclui o ano actual (ex.: «notícias IA 2026»).",
      },
    },
    required: ["query"],
  },
};

const FERRAMENTA_LER_URL: DefinicaoFerramenta = {
  nome: "ler_url",
  descricao:
    "Abre e lê o conteúdo de uma URL específica (ex.: um link que o usuário colou na conversa). " +
    "Usa esta ferramenta — não web_search — quando já existe um link concreto para ler, resumir ou analisar.",
  parametros: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL completa a abrir (deve começar com http:// ou https://).",
      },
    },
    required: ["url"],
  },
};

/** Ferramentas disponíveis no chat mobile (avalia env em runtime). */
export function listarFerramentasChat(): DefinicaoFerramenta[] {
  const ferramentas = [...FERRAMENTAS_BASE, FERRAMENTA_LER_URL];
  if (webSearchDisponivel()) {
    ferramentas.push(FERRAMENTA_WEB_SEARCH);
  }
  return ferramentas;
}

/** @deprecated Preferir listarFerramentasChat() — lista estática sem web_search dinâmico. */
export const FERRAMENTAS_CHAT: DefinicaoFerramenta[] = FERRAMENTAS_BASE;
