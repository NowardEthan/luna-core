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

/**
 * As mãos dela na rotina.
 *
 * Ela já LIA a rotina (sabe onde ele está). Isto dá-lhe a mão para escrever — e a diferença
 * é enorme: sem isto, quando ele pede «monta-me a semana», ela só pode FINGIR que montou.
 * Era o mesmo teatro do whitepaper («*abro o ficheiro e leio*» sem abrir nada) — e o Ethan
 * apanhou o risco antes de acontecer.
 *
 * O bloco criado por ela nasce marcado (`origem: luna`) e aparece no ecrã como «sugerido pela
 * Luna». Ele apaga com um toque. Uma companheira que mexe na agenda de alguém tem de deixar
 * rasto — o contrário disso não é ajuda, é intrusão.
 */
const FERRAMENTA_VER_ROTINA: DefinicaoFerramenta = {
  nome: "ver_rotina",
  descricao:
    "Lê a rotina completa dele (todos os blocos da semana). Já recebes no briefing onde ele está AGORA — " +
    "usa esta ferramenta só quando precisas da semana inteira: para responder «o que tenho na terça?», " +
    "para procurar um buraco livre, ou antes de criar um bloco (para não pisares outro).",
  parametros: {
    type: "object",
    properties: {
      dia: {
        type: "number",
        description: "Só um dia (0=domingo … 6=sábado). Se omitido, devolve a semana toda.",
      },
    },
    required: [],
  },
};

const FERRAMENTA_CRIAR_BLOCO: DefinicaoFerramenta = {
  nome: "criar_bloco",
  descricao:
    "Cria um bloco na rotina dele — usa quando ele te PEDE («me monta a semana», «marca hebraico na terça») " +
    "ou quando ele aceita uma sugestão tua. Vê a rotina ANTES (`ver_rotina`) para não pores um bloco em cima de outro. " +
    "Um bloco por chamada; para montar uma semana, chamas várias vezes. " +
    "O que criares fica marcado como sugerido por ti, e ele pode apagar com um toque — por isso não tenhas medo de propor, " +
    "mas também não lhe enchas a agenda sem ele pedir.",
  parametros: {
    type: "object",
    properties: {
      titulo: {
        type: "string",
        description: "Nome curto, como ele diria: «ônibus + duolingo», «academia», «hebraico».",
      },
      dias: {
        type: "array",
        items: { type: "number" },
        description: "Dias da semana: 0=domingo, 1=segunda … 6=sábado. Ex.: [1,2,3,4,5] = dias úteis.",
      },
      inicio: {
        type: "string",
        description: "Hora de início, «HH:MM» (ex.: «07:30»).",
      },
      fim: {
        type: "string",
        description: "Hora de fim, «HH:MM» (ex.: «09:00»).",
      },
      nota: {
        type: "string",
        description: "Uma nota curta que TU vais ler depois (ex.: «12 dias de ofensiva»).",
      },
      notificar: {
        type: "boolean",
        description: "Avisar/cobrar quando começa. Default: sim.",
      },
    },
    required: ["titulo", "dias", "inicio", "fim"],
  },
};

const FERRAMENTA_APAGAR_BLOCO: DefinicaoFerramenta = {
  nome: "apagar_bloco",
  descricao:
    "Apaga um bloco da rotina. SÓ quando ele pedir explicitamente. Vê `ver_rotina` primeiro para saber o id certo.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (vem do `ver_rotina`)." },
    },
    required: ["bloco_id"],
  },
};

/** Ferramentas disponíveis no chat mobile (avalia env em runtime). */
export function listarFerramentasChat(): DefinicaoFerramenta[] {
  const ferramentas = [
    ...FERRAMENTAS_BASE,
    FERRAMENTA_LER_URL,
    FERRAMENTA_VER_ROTINA,
    FERRAMENTA_CRIAR_BLOCO,
    FERRAMENTA_APAGAR_BLOCO,
  ];
  if (webSearchDisponivel()) {
    ferramentas.push(FERRAMENTA_WEB_SEARCH);
  }
  return ferramentas;
}

/** @deprecated Preferir listarFerramentasChat() — lista estática sem web_search dinâmico. */
export const FERRAMENTAS_CHAT: DefinicaoFerramenta[] = FERRAMENTAS_BASE;
