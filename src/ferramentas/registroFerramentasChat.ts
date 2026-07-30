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

/**
 * Cruzar fontes — só aparece no modo pesquisa profunda (opcional). Sem ela registrada,
 * o modelo nem sabe que existe, e o chat comum não paga a chamada extra.
 */
const FERRAMENTA_VERIFICAR_FONTES: DefinicaoFerramenta = {
  nome: "verificar_fontes",
  descricao:
    "Cruza as afirmações que vais dizer contra as fontes que JÁ leste neste turno (web_search/ler_url). " +
    "Um segundo par de olhos cético julga cada afirmação só pelo que está nas fontes e devolve o que está " +
    "sustentado, o que é parcial e o que não se encontra. Chama UMA vez, DEPOIS de pesquisar e ANTES de " +
    "escrever a resposta final — nunca antes de ter fontes. Depois escreve reconciliando o que voltar.",
  parametros: {
    type: "object",
    properties: {
      afirmacoes: {
        type: "array",
        items: { type: "string" },
        description: "As afirmações concretas que pretendes dizer (uma por item) — as que valem verificar.",
      },
      foco: {
        type: "string",
        description: "A pergunta/assunto em foco, para orientar o cruzamento. Opcional.",
      },
    },
    required: ["afirmacoes"],
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
    "reorganizar/refazer a rotina — só a vês por inteiro aqui, então lê ANTES de mexer. Cada tarefa vem " +
    "com um id curto entre colchetes, ex.: [stabc] — é por ele que o `organizar_tarefas` mantém a tarefa. " +
    "── DUAS listas de tarefas ── Cada bloco pode ter «tarefas de HOJE» (as peças que mudam a cada dia, " +
    "só valem hoje) e «tarefas FIXAS (todo dia)» (o molde recorrente). Pra mexer em QUALQUER tarefa " +
    "(adicionar, tirar, renomear, REORDENAR), usa só `organizar_tarefas`: mandas a lista nova de `fixas` " +
    "e/ou `hoje` — cada uma separada, então nunca confundas as camadas.",
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
    "Escreve o ROTEIRO ou o GUIA de um bloco (o TEXTO que ajuda — não as tarefas; pra tarefas usa " +
    "`organizar_tarefas`). O roteiro é o COMO curto: ele tem TDAH, o problema não é lembrar a tarefa, " +
    "é COMEÇAR. «Almoço 12h–13h» não arranca; «descongela o frango, arroz na panela, corta o tomate " +
    "enquanto coze» arranca. O guia é o fundo (a receita/treino/plano inteiro), SÓ quando ele pede. " +
    "Na tua voz, não um manual.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (vem do `ver_rotina`)." },
      roteiro: {
        type: "string",
        description:
          "Texto curto: como fazer, o que ter em conta, um empurrão. Na tua voz, não um manual.",
      },
      guia: {
        type: "string",
        description:
          "O guia FUNDO — a receita completa com ingredientes e quantidades, o treino inteiro, " +
          "o plano de estudo detalhado. SEM limite de tamanho, mas SÓ quando ele PEDE («me dá a receita», " +
          "«detalha mais», «como faço isso direito»). Não escrevas guia sem ele pedir. Aqui podes usar " +
          "linhas e listas (com «- » ou «1. »).",
      },
    },
    required: ["bloco_id"],
  },
};

/**
 * A via ÚNICA pras tarefas de um bloco: a Luna DECLARA a lista nova, o servidor CONCILIA.
 *
 * Substituiu adicionar/remover_subtarefa: o Ethan achou estranho o fluxo antigo (remover×N +
 * adicionar×N, rastreando id, sem reordenar). Agora ela pensa em LISTA — manda `fixas` e/ou `hoje`
 * na ordem que quer, cada item com `id` (mantém) ou só texto (nova); o servidor preserva o «feito»,
 * renomeia, reordena, cria e remove — e RELATA o que fez.
 */
const FERRAMENTA_ORGANIZAR_TAREFAS: DefinicaoFerramenta = {
  nome: "organizar_tarefas",
  descricao:
    "A ferramenta ÚNICA pra mexer nas tarefas de um bloco: adicionar, tirar, renomear e REORDENAR. " +
    "Tu DECLARAS a lista nova e o servidor concilia. Fluxo: 1) `ver_rotina` (cada tarefa vem com um id " +
    "curto, ex. [stabc]); 2) chama isto com a lista NOVA. " +
    "── Como montar cada item ── item com `id` = mantém aquela tarefa (guarda o «feito» dela); com " +
    "`texto` novo junto = renomeia; item SÓ com `texto` (sem id) = tarefa NOVA. A ORDEM do array é a " +
    "ordem que fica. Um id que existia e ficou de FORA da lista é REMOVIDO. " +
    "── DUAS listas separadas ── `fixas` = o molde que repete todo dia; `hoje` = só hoje. Manda a que " +
    "for mexer (ou as duas). Reorganizar as de HOJE mexe SÓ em `hoje` — nunca vira permanente. " +
    "── NÃO APAGUE TAREFAS FEITAS ── Tu DEVES incluir as tarefas já concluídas (as que têm '✓' no ver_rotina) " +
    "na tua nova lista, enviando o 'id' original delas. Se tu as omitires, o servidor vai DELETÁ-LAS " +
    "permanentemente do banco. Omitir significa 'apagar', não 'esconder'. " +
    "── CUIDADO ── cada lista é a INTEIRA: inclui SEMPRE todas as tarefas que devem FICAR. Pra esvaziar " +
    "de propósito, manda a lista vazia com `limpar: true`. Formato: Maiúscula, curta e limpa.",
  parametros: {
    type: "object",
    properties: {
      bloco_id: { type: "string", description: "O id do bloco (do `ver_rotina`)." },
      fixas: {
        type: "array",
        description: "A lista INTEIRA das tarefas FIXAS (todo dia), na ordem desejada. Omite pra não mexer nelas.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "O id da tarefa existente a manter ([...] no ver_rotina). Omite se é nova." },
            texto: { type: "string", description: "O texto da tarefa (obrigatório se é nova; presente = renomeia a existente)." },
            hora: { type: "string", description: "«HH:MM», opcional — só se a tarefa tem hora certa (dentro do bloco)." },
            notificar: { type: "boolean", description: "Com hora, cobrar nesse horário? Default não." },
          },
        },
      },
      hoje: {
        type: "array",
        description: "A lista INTEIRA das tarefas de HOJE (só hoje), na ordem desejada. Omite pra não mexer nelas.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "O id da tarefa existente a manter. Omite se é nova." },
            texto: { type: "string", description: "O texto (obrigatório se é nova; presente = renomeia)." },
            hora: { type: "string", description: "«HH:MM», opcional." },
            notificar: { type: "boolean", description: "Com hora, cobrar? Default não." },
          },
        },
      },
      limpar: { type: "boolean", description: "Só pra confirmar esvaziar uma lista de propósito (lista vazia). Senão, lista vazia é recusada." },
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

const FERRAMENTA_ANOTAR_IDEIA: DefinicaoFerramenta = {
  nome: "anotar_ideia",
  descricao:
    "Usa quando ele te pede para anotar, lembrar ou guardar uma ideia, insight, ou tarefa solta que ele não quer esquecer, mas que ainda não tem lugar na rotina. Guarda o texto na 'Caixa de Entrada' dele.",
  parametros: {
    type: "object",
    properties: {
      texto: { type: "string", description: "O pensamento, ideia ou anotação a ser guardado." },
    },
    required: ["texto"],
  },
};

const FERRAMENTA_VER_IDEIAS: DefinicaoFerramenta = {
  nome: "ver_ideias",
  descricao:
    "Lê as ideias da Caixa de Entrada do usuário. Retorna tanto as ideias pendentes (que ainda precisam de triagem) " +
    "quanto as ideias arquivadas (que já viraram tarefa ou foram guardadas). Use isso para ajudar a organizar a mente do usuário, " +
    "cruzar pensamentos, gerar insights baseados no que ele já anotou ou resgatar coisas antigas.",
  parametros: {
    type: "object",
    properties: {},
    required: [],
  },
};

/**
 * Criar artefato — só aparece quando o ambiente liga `documentosAtivo` (por ora, só o OrbitLab).
 *
 * É a mão que transforma a conversa em algo que FICA: um texto, um plano, um rascunho, uma
 * auditoria — coisa que vale guardar num lugar próprio, fora do fluxo do chat. Chama-se «artefato»
 * (não «documento/arquivo») de propósito, pra a Luna não o confundir com os PDFs que o usuário
 * anexa (`ler_arquivo`). Trancada por flag porque o core é partilhado com o app estável que gente
 * real usa; sem a flag, o modelo nem sabe que existe.
 */
const FERRAMENTA_CRIAR_DOCUMENTO: DefinicaoFerramenta = {
  nome: "criar_artefato",
  descricao:
    "Cria um ARTEFATO que fica guardado na estante dele (não é uma mensagem de chat, que se " +
    "dilui no fluxo). Um artefato é algo que TU escreves e que fica: um texto, um plano, um " +
    "rascunho, um resumo, uma auditoria, uma carta. (Não confundas com `ler_arquivo`, que é para " +
    "os ARQUIVOS/PDFs que ELE anexou — isso ele subiu, o artefato tu crias.) Usa quando ele PEDE " +
    "(«escreve isso num artefato/documento», «me faz um texto sobre…», «guarda isso») OU quando o " +
    "que vocês construíram na conversa é substancial e vale ter um lugar próprio. NÃO uses para " +
    "respostas curtas de conversa — só quando há corpo que vale reabrir depois. O artefato nasce " +
    "desta conversa (aparece como cartão aqui) e ele poderá abrir, ler e editar. Depois de criar, " +
    "confirma na tua voz que ficou guardado — NÃO repitas o texto inteiro no chat.",
  parametros: {
    type: "object",
    properties: {
      titulo: {
        type: "string",
        description: "Um título curto e claro, como ele o chamaria — ex.: «Política de privacidade», «Plano da semana».",
      },
      conteudo: {
        type: "string",
        description:
          "O corpo do artefato, em Markdown (títulos com #, listas com «- », **negrito**). " +
          "Escreve o artefato INTEIRO aqui — é isto que fica guardado.",
      },
    },
    required: ["titulo", "conteudo"],
  },
};

/**
 * Listar / ler / editar artefatos — o resto da mão, para a Luna AUDITAR e REVISAR o que já
 * existe, não só criar. Mesma trava (`documentosAtivo`): fora do OrbitLab, nem existem.
 */
const FERRAMENTA_LISTAR_DOCUMENTOS: DefinicaoFerramenta = {
  nome: "listar_artefatos",
  descricao:
    "Lista os artefatos desta conversa (id + título). Usa para saber o que já existe antes de " +
    "ler ou editar — ex.: quando ele diz «revisa aquele artefato» e tu precisas do id. Não repete " +
    "o corpo; para o texto, usa ler_artefato com o id.",
  parametros: { type: "object", properties: {}, required: [] },
};

const FERRAMENTA_LER_DOCUMENTO: DefinicaoFerramenta = {
  nome: "ler_artefato",
  descricao:
    "Lê o corpo atual de um artefato pelo id (Markdown). Usa ANTES de auditar ou reescrever — " +
    "para reagir ao que ESTÁ lá, não ao que tu achas que está. Se não souberes o id, chama " +
    "listar_artefatos primeiro.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato (vem do listar_artefatos ou de quando o criaste)." },
    },
    required: ["id"],
  },
};

const FERRAMENTA_EDITAR_DOCUMENTO: DefinicaoFerramenta = {
  nome: "editar_artefato",
  descricao:
    "Reescreve um artefato que já existe — a mão da revisão/auditoria. Usa quando ele pede " +
    "«ajusta isso», «reescreve o parágrafo tal», «corrige o artefato». LÊ o artefato antes " +
    "(ler_artefato) e manda o CORPO INTEIRO reescrito em `conteudo` (não um trecho — o conteudo " +
    "substitui o texto todo). Opcionalmente muda o `titulo`. Depois, na tua voz, conta o que mudaste " +
    "— NÃO repitas o texto inteiro no chat.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato a editar (de listar_artefatos)." },
      titulo: { type: "string", description: "Novo título (só se for para mudar)." },
      conteudo: {
        type: "string",
        description:
          "O corpo INTEIRO reescrito, em Markdown. Substitui todo o texto atual — inclui o que " +
          "fica, não só o trecho novo.",
      },
    },
    required: ["id"],
  },
};

/**
 * O plano em passos — a coleira que segura um modelo one-shot na cadeia.
 *
 * O deepseek-v4-pro dá UMA chamada de ferramenta e sai: criar (1 salto) funciona, mas uma
 * tarefa de 3 saltos (ler → reescrever → conferir) é abandonada no meio — ele "vê" o resultado
 * do primeiro, sente-se pronto e escreve a resposta na bolha em vez de continuar. A lista visível
 * resolve como o Cursor/Antigravity: ele DECLARA os passos, marca um a um, e cada marca devolve
 * «próximo passo» que o traz de volta ao loop. Um modelo fraco COM lista encadeia como um forte
 * sem ela. Só aparece com `planejamentoAtivo` (por ora, só o OrbitLab).
 */
const FERRAMENTA_PLANEJAR: DefinicaoFerramenta = {
  nome: "planejar",
  descricao:
    "Cria uma LISTA DE PASSOS visível para uma tarefa que precisa de MAIS DE UMA ação encadeada " +
    "(ex.: ler um documento e depois reescrevê-lo; montar vários blocos; pesquisar e depois cruzar as fontes). " +
    "Chama isto PRIMEIRO, antes de agir, com 2 a 5 passos curtos e concretos (cada um uma ação). A lista " +
    "fica à vista dele, para conferir o teu caminho. Depois executa um passo de cada vez e marca com " +
    "`concluir_passo`. NÃO uses para um pedido de uma ação só — aí vai direto.",
  parametros: {
    type: "object",
    properties: {
      passos: {
        type: "array",
        items: { type: "string" },
        description:
          "Os passos, curtos e na ordem — ex.: [«ler o documento atual», «reescrever em prosa», «conferir o resultado»].",
      },
    },
    required: ["passos"],
  },
};

const FERRAMENTA_CONCLUIR_PASSO: DefinicaoFerramenta = {
  nome: "concluir_passo",
  descricao:
    "Marca um passo do plano como FEITO, pelo número (1, 2, 3…). Chama DEPOIS de realmente executar aquele " +
    "passo. Recebes de volta a lista atualizada e qual é o próximo. Enquanto houver passo por marcar, NÃO " +
    "escrevas a resposta final — o trabalho não acabou.",
  parametros: {
    type: "object",
    properties: {
      numero: { type: "number", description: "O número do passo que acabaste de concluir (1 = o primeiro)." },
    },
    required: ["numero"],
  },
};

const FERRAMENTA_ADICIONAR_PASSO: DefinicaoFerramenta = {
  nome: "adicionar_passo",
  descricao:
    "Acrescenta um passo ao plano quando descobres, no meio do caminho, que falta uma ação. Entra no fim da " +
    "lista (ainda por fazer). Usa com parcimónia — só quando é mesmo preciso.",
  parametros: {
    type: "object",
    properties: {
      texto: { type: "string", description: "O passo novo, curto e concreto." },
    },
    required: ["texto"],
  },
};

/** Ferramentas disponíveis no chat mobile (avalia env em runtime). */
export function listarFerramentasChat(
  opcoes: { pesquisaProfunda?: boolean; documentosAtivo?: boolean; planejamentoAtivo?: boolean } = {},
): DefinicaoFerramenta[] {
  const ferramentas = [
    ...FERRAMENTAS_BASE,
    FERRAMENTA_LER_URL,
    FERRAMENTA_VER_ROTINA,
    FERRAMENTA_CRIAR_BLOCO,
    FERRAMENTA_EDITAR_BLOCO,
    FERRAMENTA_DETALHAR_BLOCO,
    FERRAMENTA_ORGANIZAR_TAREFAS,
    FERRAMENTA_PAUSAR_BLOCO,
    FERRAMENTA_RETOMAR_BLOCO,
    FERRAMENTA_VER_ROTINAS,
    FERRAMENTA_CRIAR_ROTINA,
    FERRAMENTA_EDITAR_ROTINA,
    FERRAMENTA_APAGAR_ROTINA,
    FERRAMENTA_APAGAR_BLOCO,
    FERRAMENTA_ANOTAR_IDEIA,
    FERRAMENTA_VER_IDEIAS,
  ];
  // Documentos: só no ambiente que os ativa (OrbitLab). Fora dele, as ferramentas nem existem.
  if (opcoes.documentosAtivo) {
    ferramentas.push(FERRAMENTA_CRIAR_DOCUMENTO);
    ferramentas.push(FERRAMENTA_LISTAR_DOCUMENTOS);
    ferramentas.push(FERRAMENTA_LER_DOCUMENTO);
    ferramentas.push(FERRAMENTA_EDITAR_DOCUMENTO);
  }
  // Plano em passos: a coleira que segura o modelo na cadeia de ferramentas. Também só no OrbitLab.
  if (opcoes.planejamentoAtivo) {
    ferramentas.push(FERRAMENTA_PLANEJAR);
    ferramentas.push(FERRAMENTA_CONCLUIR_PASSO);
    ferramentas.push(FERRAMENTA_ADICIONAR_PASSO);
  }
  if (webSearchDisponivel()) {
    ferramentas.push(FERRAMENTA_WEB_SEARCH);
    // Cruzar fontes só faz sentido havendo busca — e só no modo opcional.
    if (opcoes.pesquisaProfunda) {
      ferramentas.push(FERRAMENTA_VERIFICAR_FONTES);
    }
  }
  return ferramentas;
}

/** @deprecated Preferir listarFerramentasChat() — lista estática sem web_search dinâmico. */
export const FERRAMENTAS_CHAT: DefinicaoFerramenta[] = FERRAMENTAS_BASE;
