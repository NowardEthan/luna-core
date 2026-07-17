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
    "Lê a rotina completa dele, com TUDO: cada bloco com os seus passos, tarefas, alarme, roteiro, e " +
    "em que rotina está (Normal ou uma alternativa). Já recebes no briefing onde ele está AGORA — usa " +
    "esta ferramenta quando precisas da semana inteira: para responder «o que tenho na terça?», procurar " +
    "um buraco livre, antes de criar um bloco (para não pisares outro), e SEMPRE que ele pedir para " +
    "reorganizar/refazer a rotina — só a vês por inteiro aqui, então lê ANTES de mexer.",
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
      rotina: {
        type: "string",
        description:
          "Em qual rotina pôr o bloco: o NOME de uma alternativa («Férias», «Semana de provas»). " +
          "Omite para a Normal. É assim que montas uma rotina alternativa inteira — cria a rotina " +
          "primeiro (criar_rotina) e depois põe os blocos nela com este campo.",
      },
      alarme: {
        type: "boolean",
        description:
          "Modo alarme: no início vira um aviso FIXO, com vibração e som forte, que só para quando " +
          "ele marca «Comecei». Só para o que não pode passar batido (acordar, remédio). Default: não.",
      },
    },
    required: ["titulo", "dias", "inicio", "fim"],
  },
};

const FERRAMENTA_EDITAR_BLOCO: DefinicaoFerramenta = {
  nome: "editar_bloco",
  descricao:
    "Muda um bloco que já existe — a hora, os dias, o nome, a nota, ou se ele cobra. " +
    "Passas SÓ o que queres mudar: o resto fica como estava. " +
    "Usa isto (e não apagar+criar) quando ele diz «adianta o duolingo pras 8h» ou «tira a academia do sábado» — " +
    "apagar e recriar perderia a nota e a cor dele. Vê `ver_rotina` primeiro para saber o id.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (vem do `ver_rotina`)." },
      titulo: { type: "string", description: "Novo nome (só se for para mudar)." },
      dias: {
        type: "array",
        items: { type: "number" },
        description: "Novos dias (0=domingo … 6=sábado). Substituem os anteriores.",
      },
      inicio: { type: "string", description: "Nova hora de início, «HH:MM»." },
      fim: { type: "string", description: "Nova hora de fim, «HH:MM»." },
      nota: { type: "string", description: "Nova nota (string vazia apaga a nota)." },
      notificar: { type: "boolean", description: "Passar a cobrar, ou deixar de cobrar." },
      alarme: { type: "boolean", description: "Ligar/desligar o modo alarme (aviso fixo até «Comecei»)." },
      rotina: {
        type: "string",
        description:
          "Mover o bloco para outra rotina: o NOME de uma alternativa, ou «normal» para o devolver à Normal.",
      },
    },
    required: ["bloco_id"],
  },
};

/**
 * O roteiro do bloco — a peça que faz a tarefa ARRANCAR.
 *
 * O obstáculo do Ethan não é lembrar-se de que o almoço existe: é por ONDE COMEÇAR. Um bloco
 * que diz «Almoço · 12h–13h» não arranca ninguém. Com passos, arranca.
 *
 * E há um perigo que a descrição diz-lhe à cara: um roteiro de doze passos para «tomar banho»
 * é humilhante, e vai ser apagado no primeiro dia. O detalhe serve para arrancar, não para
 * tutelar.
 */
const FERRAMENTA_DETALHAR_BLOCO: DefinicaoFerramenta = {
  nome: "detalhar_bloco",
  descricao:
    "Escreve o ROTEIRO de um bloco: como fazer a coisa, e os passos para arrancar. " +
    "Ele tem TDAH — o problema dele não é lembrar-se da tarefa, é COMEÇAR. «Almoço 12h–13h» não " +
    "arranca ninguém; «descongela o frango (5min) · arroz na panela · corta o tomate enquanto coze» arranca. " +
    "Usa quando criares um bloco que beneficie disso (almoço, treino, estudo), ou quando ele pedir. " +
    "NO MÁXIMO 6 passos, e só onde fazem falta: doze passos para «tomar banho» é humilhante e ele vai apagar. " +
    "O roteiro é teu, na tua voz — não é um manual.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (vem do `ver_rotina`)." },
      roteiro: {
        type: "string",
        description:
          "Texto curto: como fazer, o que ter em conta, um empurrão. Na tua voz, não um manual.",
      },
      passos: {
        type: "array",
        items: { type: "string" },
        description:
          "Até 6 tarefas de ARRANQUE, na ordem — entram na lista de tarefas do bloco (é a MESMA " +
          "lista das subtarefas; não há «passos» à parte). Em formato de tarefa: cada uma numa " +
          "linha, começa com maiúscula, curta e limpa. «Descongela o frango», «Corta o tomate " +
          "enquanto o arroz coze». Acrescentam às que já existem — não apagam. Sem parágrafo nem «kkk».",
      },
      guia: {
        type: "string",
        description:
          "O guia FUNDO — a receita completa com ingredientes e quantidades, o treino inteiro, " +
          "o plano de estudo detalhado. SEM limite de tamanho, mas SÓ quando ele PEDE («me dá a receita», " +
          "«detalha mais», «como faço isso direito»). Não escrevas guia sem ele pedir: os passos já " +
          "chegam para arrancar, e um guia não pedido é a tutela que ele vai apagar. Aqui podes usar " +
          "linhas e listas (com «- » ou «1. »).",
      },
    },
    required: ["bloco_id"],
  },
};

/**
 * Adicionar uma tarefa DENTRO de um bloco — e é ADITIVA.
 *
 * «Trabalho 8h–17h» contém muitas coisas; cada uma é uma sub-tarefa que ele risca. O Ethan
 * pediu por palavras: «eu quero mais, inclua isso, aí ela vai adicionando». Ela chama isto
 * uma vez por tarefa, e cada chamada ACRESCENTA — nunca apaga as que já lá estão.
 *
 * A hora NÃO é enfeite: com `notificar`, ela cobra-o nesse horário (uma reunião às 10h dá um
 * toque às 10h). Mas só põe hora quando faz sentido — a maioria é só checklist.
 */
const FERRAMENTA_ADICIONAR_SUBTAREFA: DefinicaoFerramenta = {
  nome: "adicionar_subtarefa",
  descricao:
    "Adiciona UMA tarefa dentro de um bloco (ex.: dentro de «Trabalho», adiciona «Responder emails»). " +
    "Chama uma vez por tarefa — é aditiva, nunca apaga as outras. " +
    "Formato de tarefa, com a tua voz: cada uma numa linha, começa com maiúscula, curta e limpa " +
    "(«Responder emails», «Revisar o PR do cache») — não um parágrafo, não um «kkk» solto. " +
    "Põe `hora` só quando a tarefa TEM hora certa (uma reunião); com `notificar: true` ela cobra nesse " +
    "horário. A hora tem de estar dentro do horário do bloco pai. " +
    "── DE HOJE ou FIXA (importante) ── Toda tarefa é SÓ DE HOJE por defeito (soma amanhã limpa). " +
    "Usa `para_sempre: true` só quando é um passo RECORRENTE, parte do molde do bloco — quando ele " +
    "descreve a rotina («todo dia eu faço X», «no trabalho sempre começo ligando a máquina») ou quando " +
    "está a MONTAR o bloco do zero. Quando é coisa DO DIA («hoje tenho que cortar 3 peças», «lembra de " +
    "ligar pro dentista») deixa `para_sempre` de fora. Na dúvida, é de hoje.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (do `ver_rotina`)." },
      texto: { type: "string", description: "A tarefa, em formato de tarefa (Maiúscula, infinitivo, curto)." },
      hora: { type: "string", description: "«HH:MM», opcional — só se a tarefa tiver hora certa." },
      notificar: { type: "boolean", description: "Com hora, cobrar nesse horário? Default não." },
      para_sempre: { type: "boolean", description: "Se true, salva a tarefa no molde fixo do bloco (todos os dias). Se false ou omitido, salva apenas para hoje. O padrão é salvar apenas para hoje." },
    },
    required: ["bloco_id", "texto"],
  },
};

const FERRAMENTA_REMOVER_SUBTAREFA: DefinicaoFerramenta = {
  nome: "remover_subtarefa",
  descricao:
    "Remove uma tarefa de dentro de um bloco. SÓ quando ele pedir. Usa `sub_id` (do `ver_rotina`) ou " +
    "`texto` para encontrar pela descrição.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco." },
      sub_id: { type: "string", description: "O id da tarefa (sub=... no `ver_rotina`)." },
      texto: { type: "string", description: "Ou parte do texto da tarefa a remover." },
    },
    required: ["bloco_id"],
  },
};

const FERRAMENTA_VER_ROTINAS: DefinicaoFerramenta = {
  nome: "ver_rotinas",
  descricao:
    "Lista as ROTINAS dele (a Normal + as alternativas: Férias, Semana de provas…). Diferente de " +
    "`ver_rotina`, que mostra os BLOCOS. Usa antes de criar/aplicar uma rotina, para saber o que já existe.",
  parametros: { type: "object", properties: {}, required: [] },
};

const FERRAMENTA_CRIAR_ROTINA: DefinicaoFerramenta = {
  nome: "criar_rotina",
  descricao:
    "Cria uma ROTINA ALTERNATIVA — «cria uma rotina de férias de 20 a 3». Com período, ela assume " +
    "sozinha na data e a Normal volta no fim; sem período, ele troca à mão. É assim que se faz umas " +
    "«férias» agora (não se pausa bloco a bloco). Depois de criar, os blocos que ele puser nela só valem " +
    "no período. Se ele pediu para criar uma rotina, CHAMA esta ferramenta: dizer «criei» sem a chamar é mentira.",
  parametros: {
    type: "object",
    properties: {
      nome: { type: "string", description: "«Férias», «Semana de provas», «Home-office»…" },
      de: { type: "string", description: "Início do período («YYYY-MM-DD» ou «DD/MM»). Opcional." },
      ate: { type: "string", description: "Fim do período. Opcional (sem datas = troca à mão)." },
    },
    required: ["nome"],
  },
};

const FERRAMENTA_EDITAR_ROTINA: DefinicaoFerramenta = {
  nome: "editar_rotina",
  descricao:
    "Reprograma / APLICA uma rotina alternativa: muda o nome ou o período. Como a rotina vigora " +
    "por causa da DATA, mexer no período É aplicá-la — «aplica as férias essa semana» = põe de hoje " +
    "a domingo; «adia as provas pra dia 25» = muda o início; «tira a data» = sem_periodo (passa a " +
    "trocar à mão). Se ele pediu para aplicar/reprogramar, CHAMA esta ferramenta: dizer «apliquei» " +
    "sem a chamar é mentira.",
  parametros: {
    type: "object",
    properties: {
      rotina: { type: "string", description: "Nome (ou id) da rotina a mexer — «Férias», «Semana de provas»." },
      novo_nome: { type: "string", description: "Renomear (só se for para mudar o nome)." },
      de: { type: "string", description: "Novo início do período («YYYY-MM-DD» ou «DD/MM»)." },
      ate: { type: "string", description: "Novo fim do período." },
      sem_periodo: { type: "boolean", description: "true = tirar o período (passa a trocar à mão)." },
    },
    required: ["rotina"],
  },
};

const FERRAMENTA_APAGAR_ROTINA: DefinicaoFerramenta = {
  nome: "apagar_rotina",
  descricao:
    "Apaga uma rotina alternativa. SÓ quando ele pedir. Os blocos que estavam nela voltam a contar " +
    "como Normal (não se perdem). Não apaga a Normal — ela não é um documento.",
  parametros: {
    type: "object",
    properties: {
      rotina: { type: "string", description: "Nome (ou id) da rotina a apagar." },
    },
    required: ["rotina"],
  },
};

const FERRAMENTA_PAUSAR_BLOCO: DefinicaoFerramenta = {
  nome: "pausar_bloco",
  descricao:
    "Pausa um bloco (ou TODA a rotina) até uma data — para férias, viagens, um curso que fechou. " +
    "«o curso pegou férias até março» → pausa esse bloco; «tô de férias até dia 20, para tudo» → " +
    "SEM bloco_id, pausa a rotina inteira. Enquanto pausado, o bloco sai da grade, não cobra, e não " +
    "conta como sumiço. Volta sozinho na data. Data em «YYYY-MM-DD» ou «DD/MM». " +
    "NÃO precisas de `ver_rotina` antes — em `bloco_id` podes pôr o TÍTULO («curso», «trabalho»). " +
    "Se ele pediu para pausar, CHAMA esta ferramenta: dizer «pausei» sem a chamar é mentira.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O bloco a pausar. OMITE para pausar a rotina toda (férias)." },
      ate: { type: "string", description: "O dia em que VOLTA («2026-03-03» ou «03/03»). Obrigatório." },
      de: { type: "string", description: "Quando a pausa começa. Opcional — default é já." },
    },
    required: ["ate"],
  },
};

const FERRAMENTA_RETOMAR_BLOCO: DefinicaoFerramenta = {
  nome: "retomar_bloco",
  descricao:
    "Tira um bloco (ou tudo) da pausa antes da data — «voltei das férias», «o curso recomeçou». " +
    "SEM bloco_id, retoma a rotina inteira. Em `bloco_id` podes pôr o TÍTULO — não precisas de ver_rotina antes.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O bloco a retomar. OMITE para retomar tudo." },
    },
    required: [],
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
    FERRAMENTA_EDITAR_BLOCO,
    FERRAMENTA_DETALHAR_BLOCO,
    FERRAMENTA_ADICIONAR_SUBTAREFA,
    FERRAMENTA_REMOVER_SUBTAREFA,
    FERRAMENTA_PAUSAR_BLOCO,
    FERRAMENTA_RETOMAR_BLOCO,
    FERRAMENTA_VER_ROTINAS,
    FERRAMENTA_CRIAR_ROTINA,
    FERRAMENTA_EDITAR_ROTINA,
    FERRAMENTA_APAGAR_ROTINA,
    FERRAMENTA_APAGAR_BLOCO,
  ];
  if (webSearchDisponivel()) {
    ferramentas.push(FERRAMENTA_WEB_SEARCH);
  }
  return ferramentas;
}

/** @deprecated Preferir listarFerramentasChat() — lista estática sem web_search dinâmico. */
export const FERRAMENTAS_CHAT: DefinicaoFerramenta[] = FERRAMENTAS_BASE;
