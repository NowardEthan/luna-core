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

const FERRAMENTA_REGISTRAR_LANCAMENTO: DefinicaoFerramenta = {
  nome: "registrar_lancamento",
  descricao:
    "Registra uma ENTRADA ou SAÍDA nas finanças dele (carteira/cartão). Usa quando ele diz que gastou, " +
    "pagou, recebeu, ou pede pra anotar um valor («gastei 32 no almoço», «entrou o freela»). " +
    "O valor é em REAIS (ex.: 32.5). Se não disser a carteira, usa a primeira que ele tiver. " +
    "Não inventes lançamento sem ele pedir — e não digas que registaste sem chamar esta ferramenta.",
  parametros: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["entrada", "saida"],
        description: '"saida" pra gasto/pagamento; "entrada" pra dinheiro que entrou.',
      },
      valor: {
        type: "number",
        description: "Valor em reais (ex.: 32 ou 32.5). Nunca em centavos.",
      },
      descricao: {
        type: "string",
        description: "Nota curta (ex.: Almoço iFood).",
      },
      categoria: {
        type: "string",
        description:
          "Id: alimentacao, transporte, moradia, saude, lazer, contas, renda, outros.",
      },
      carteira: {
        type: "string",
        description: "Apelido ou id da carteira (ex.: Nubank). Opcional.",
      },
      data: {
        type: "string",
        description: "Data opcional: YYYY-MM-DD ou DD/MM. Default = hoje.",
      },
      recorrente: {
        type: "boolean",
        description:
          "Se true, também cria um recorrente mensal com o mesmo valor/categoria (dia = dia da data).",
      },
      diaDoMes: {
        type: "number",
        description: "Só com recorrente=true: dia 1–31. Default = dia da data/hoje.",
      },
    },
    required: ["tipo", "valor"],
  },
};

const FERRAMENTA_LISTAR_LANCAMENTOS: DefinicaoFerramenta = {
  nome: "listar_lancamentos",
  descricao:
    "Lista lançamentos (entradas/saídas) no período, com filtros opcionais de carteira, " +
    "categoria ou só pendentes. Usa quando ele pergunta o que gastou, o extrato, ou pediu " +
    "detalhe — não inventes linhas. NÃO uses web_search pra isto: a grana dele está aqui.",
  parametros: {
    type: "object",
    properties: {
      periodo: {
        type: "string",
        enum: ["dia", "semana", "mes"],
        description: "Recorte. Default: mes.",
      },
      carteira: {
        type: "string",
        description: "Apelido ou id da carteira. Opcional.",
      },
      categoria: {
        type: "string",
        description: "Id da categoria. Opcional.",
      },
      soPendentes: {
        type: "boolean",
        description: "Se true, só contas ainda não pagas.",
      },
    },
    required: [],
  },
};

const FERRAMENTA_RESUMO_FINANCEIRO: DefinicaoFerramenta = {
  nome: "resumo_financeiro",
  descricao:
    "Lê o resumo financeiro dele (entrou/saiu/saldo, por categoria, contas pendentes) no período. " +
    "Usa SEMPRE em «quanto gastei», «quanto saiu», resumo do mês/semana, orçamento. " +
    "Não chute números — chama isto. NÃO uses web_search: não é dado público.",
  parametros: {
    type: "object",
    properties: {
      periodo: {
        type: "string",
        enum: ["dia", "semana", "mes"],
        description: "Recorte. Default: mes.",
      },
    },
    required: [],
  },
};

const FERRAMENTA_GERIR_RECORRENTE: DefinicaoFerramenta = {
  nome: "gerir_recorrente",
  descricao:
    "Cria, edita, desativa ou lista recorrentes mensais (aluguel, salário, Netflix…). " +
    "Usa quando ele fala de conta fixa / «todo mês». Não inventes — chama a ferramenta.",
  parametros: {
    type: "object",
    properties: {
      acao: {
        type: "string",
        enum: ["criar", "editar", "desativar", "listar"],
        description: "O que fazer.",
      },
      id: {
        type: "string",
        description: "Id do recorrente (editar/desativar). Ou usa apelido.",
      },
      apelido: {
        type: "string",
        description: "Nome (criar) ou busca (editar/desativar).",
      },
      novoApelido: {
        type: "string",
        description: "Só em editar: novo nome.",
      },
      tipo: {
        type: "string",
        enum: ["entrada", "saida"],
        description: '"entrada" ou "saida".',
      },
      valor: {
        type: "number",
        description: "Valor em reais.",
      },
      diaDoMes: {
        type: "number",
        description: "Dia 1–31 do mês.",
      },
      categoria: {
        type: "string",
        description: "Id da categoria.",
      },
      carteira: {
        type: "string",
        description: "Apelido ou id da carteira.",
      },
      variavel: {
        type: "boolean",
        description: "Valor é estimativa (ex.: energia).",
      },
      ativo: {
        type: "boolean",
        description: "Se false, desativa o recorrente.",
      },
    },
    required: ["acao"],
  },
};

const FERRAMENTA_GERIR_CARTEIRA: DefinicaoFerramenta = {
  nome: "gerir_carteira",
  descricao:
    "Cria, edita, arquiva ou lista carteiras e CARTÕES. Usa quando ele pede «cria um cartão», " +
    "«adiciona o Nubank», «conta débito», dinheiro, crédito com limite/fechamento/vencimento. " +
    "Pra cartão: acao=criar, tipo=cartao_credito. Não digas que criaste sem chamar isto.",
  parametros: {
    type: "object",
    properties: {
      acao: {
        type: "string",
        enum: ["criar", "editar", "arquivar", "listar"],
        description: "O que fazer.",
      },
      id: {
        type: "string",
        description: "Id da carteira (editar/arquivar).",
      },
      apelido: {
        type: "string",
        description: "Nome (criar) ou busca (editar/arquivar).",
      },
      novoApelido: {
        type: "string",
        description: "Só em editar: novo nome.",
      },
      tipo: {
        type: "string",
        enum: ["conta_debito", "cartao_credito", "dinheiro"],
        description: "Tipo da carteira.",
      },
      banco: {
        type: "string",
        description: "Nome do banco (opcional).",
      },
      cor: {
        type: "string",
        description: "grafite, azul, roxo, verde, ambar.",
      },
      ultimos4: {
        type: "string",
        description: "Últimos 4 dígitos (opcional).",
      },
      saldoInicial: {
        type: "number",
        description: "Saldo inicial em reais (débito/dinheiro).",
      },
      limite: {
        type: "number",
        description: "Limite em reais (crédito).",
      },
      fechamentoDia: {
        type: "number",
        description: "Dia de fechamento da fatura (1–31).",
      },
      vencimentoDia: {
        type: "number",
        description: "Dia de vencimento da fatura (1–31).",
      },
    },
    required: ["acao"],
  },
};

const FERRAMENTA_GERIR_META: DefinicaoFerramenta = {
  nome: "gerir_meta",
  descricao:
    "Cria, edita, apaga ou lista metas financeiras (reserva, corte por categoria, teto do mês). " +
    "Usa quando ele fala de meta, orçamento-alvo, «quero juntar X», «limite de gasto». " +
    "Não digas que criaste sem chamar isto.",
  parametros: {
    type: "object",
    properties: {
      acao: {
        type: "string",
        enum: ["criar", "editar", "apagar", "listar"],
        description: "O que fazer.",
      },
      id: {
        type: "string",
        description: "Id da meta (editar/apagar).",
      },
      apelido: {
        type: "string",
        description: "Nome (criar) ou busca (editar/apagar).",
      },
      novoApelido: {
        type: "string",
        description: "Só em editar: novo nome.",
      },
      tipo: {
        type: "string",
        enum: ["reserva", "corte", "gasto_mes"],
        description: "reserva = juntar; corte = teto por categoria; gasto_mes = teto do mês.",
      },
      alvo: {
        type: "number",
        description: "Valor-alvo em reais.",
      },
      atual: {
        type: "number",
        description: "Progresso atual em reais (só reserva, opcional).",
      },
      categoria: {
        type: "string",
        description: "Obrigatório em corte: alimentacao, transporte, etc.",
      },
      ativa: {
        type: "boolean",
        description: "Se false, desativa a meta (editar).",
      },
    },
    required: ["acao"],
  },
};

const FERRAMENTA_TRANSFERIR: DefinicaoFerramenta = {
  nome: "transferir",
  descricao:
    "Move dinheiro entre carteiras SEM contar como gasto nem entrada (ex.: pagar fatura do " +
    "crédito com o débito, reserva). Usa quando ele diz «transfere», «paga a fatura», «move X " +
    "pro cartão». Não inventes — chama isto.",
  parametros: {
    type: "object",
    properties: {
      de: {
        type: "string",
        description: "Carteira de origem (apelido ou id).",
      },
      para: {
        type: "string",
        description: "Carteira de destino.",
      },
      valor: {
        type: "number",
        description: "Valor em reais.",
      },
      motivo: {
        type: "string",
        enum: ["pagar_fatura", "reserva", "ajuste"],
        description: "Default: ajuste.",
      },
      data: {
        type: "string",
        description: "YYYY-MM-DD ou DD/MM. Default = hoje.",
      },
      nota: {
        type: "string",
        description: "Nota opcional.",
      },
    },
    required: ["de", "para", "valor"],
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
 * A mão que DESENHA DO ZERO — a Luna gera uma imagem NOVA, sem referência. Mesma trava
 * (`documentosAtivo`): só no OrbitLab. A imagem NÃO viaja na fala; sobe pro Storage e o cartão
 * dela aparece no chat.
 *
 * ⚠️ Continuidade: se ele quer «o MESMO» personagem/objeto de uma imagem que já existe nesta
 * conversa — mesmo numa cena, pose ou ângulo TOTALMENTE novos — isto NÃO serve (pinta do zero e
 * sai outro bicho); usa `editar_imagem`, que carrega a anterior como referência.
 */
const FERRAMENTA_GERAR_IMAGEM: DefinicaoFerramenta = {
  nome: "gerar_imagem",
  descricao:
    "Desenha uma IMAGEM NOVA, do ZERO, a partir de uma descrição e mostra-a como um cartão aqui no " +
    "chat. Usa quando ele PEDE uma imagem de um assunto NOVO («desenha…», «cria uma imagem de…», " +
    "«faz uma arte/ilustração/capa/ícone de…», «como seria… numa imagem?»). O `prompt` é a descrição " +
    "visual, em português ou inglês — quanto mais concreta (assunto, estilo, cores, luz, " +
    "enquadramento), melhor o resultado; se ele foi vago, ENRIQUECE com bom senso visual em vez de " +
    "pedir detalhes. ── ATENÇÃO À CONTINUIDADE ── se o pedido é sobre «o MESMO» gato/personagem/" +
    "objeto de uma imagem que já existe nesta conversa (mesmo que peça outra cena, outro ângulo, " +
    "«mais trabalhada», «em perspectiva»), NÃO uses isto — pintarias do zero e sairia OUTRO. Aí é " +
    "`editar_imagem`, que parte da imagem anterior como referência e mantém o personagem. Demora " +
    "alguns segundos. NÃO uses para responder algo que é texto, nem para «ver» uma imagem que ELE " +
    "mandou (isso é a visão, não isto). Depois de gerar, comenta na tua voz — o cartão já mostra a " +
    "imagem, não a descrevas inteira.",
  parametros: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "A descrição visual do que desenhar — assunto + estilo + cores/atmosfera + " +
          "enquadramento. Ex.: «uma raposa origami dourada sobre fundo grafite, luz suave, " +
          "minimalista». Se quiseres texto dentro da imagem, escreve-o entre aspas no prompt.",
      },
    },
    required: ["prompt"],
  },
};

/**
 * A mão da CONTINUIDADE — parte da última imagem da conversa como REFERÊNCIA (image-to-image) e
 * mantém o mesmo personagem/objeto. Cobre DOIS casos: (a) retoque — mexe só num detalhe e preserva
 * o resto; (b) re-encenar — o MESMO personagem numa cena/pose/ângulo totalmente novos. Sem isto, um
 * «adiciona um sachê» OU um «faz o mesmo gato noutra cena» ia pro `gerar_imagem` e saía outro bicho
 * do zero. Testado: o Riverflow segura o personagem mesmo trocando cenário e ângulo inteiros. Mesma
 * trava (`documentosAtivo`): só no OrbitLab.
 */
const FERRAMENTA_EDITAR_IMAGEM: DefinicaoFerramenta = {
  nome: "editar_imagem",
  descricao:
    "Parte da ÚLTIMA imagem desta conversa como REFERÊNCIA e produz uma nova versão MANTENDO o mesmo " +
    "personagem/objeto (image-to-image). Serve pra DOIS casos: " +
    "① RETOQUE — mexer só num detalhe e preservar o resto («adiciona um…», «tira o…», «muda a cor " +
    "de…», «põe um chapéu nele», «deixa igual mas de noite»). " +
    "② RE-ENCENAR — pegar «o MESMO» gato/personagem/objeto e pô-lo numa CENA, pose ou ângulo NOVOS " +
    "(«faz o mesmo gato agora numa rua», «esse personagem em perspectiva, mais trabalhado», «o mesmo " +
    "mas num cenário de floresta»). Repara: mesmo o usuário dizendo «cria OUTRA imagem» ou «uma NOVA " +
    "cena», se é «o MESMO» de uma imagem que já existe aqui, é ISTO — não o `gerar_imagem`, que " +
    "pintaria do zero e perderia o personagem. Só funciona se já houver uma imagem nesta conversa; " +
    "se não houver (ou se o assunto é totalmente novo, sem ligação com a anterior), usa `gerar_imagem`.",
  parametros: {
    type: "object",
    properties: {
      instrucao: {
        type: "string",
        description:
          "O que fazer. Para um RETOQUE, diz só o que muda («adiciona um sachê de chá na xícara», " +
          "«troca o fundo para azul») — o resto é preservado sozinho. Para RE-ENCENAR o mesmo " +
          "personagem, descreve a CENA nova por inteiro e deixa claro que o personagem é o mesmo — " +
          "ex.: «o mesmo gato laranja de chapéu e botas, agora numa rua de paralelepípedo à noite, " +
          "perspectiva baixa, clima noir; mantém o personagem idêntico, muda só o cenário e o ângulo».",
      },
    },
    required: ["instrucao"],
  },
};

/**
 * Listar / ler / editar artefatos — o resto da mão, para a Luna AUDITAR e REVISAR o que já
 * existe, não só criar. Mesma trava (`documentosAtivo`): fora do OrbitLab, nem existem.
 */
const FERRAMENTA_LISTAR_DOCUMENTOS: DefinicaoFerramenta = {
  nome: "listar_artefatos",
  descricao:
    "Lista os artefatos da estante dele — de TODAS as conversas (id + título + se é desta ou de " +
    "outra). Usa quando ele pergunta se tu lembras de um artefato, cita um nome («meus gastos»), " +
    "ou antes de ler/editar e precisas do id. Não inventes que não existe sem ter listado. Não " +
    "repete o corpo; para o texto, usa ler_artefato com o id.",
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
    "Reescreve um artefato do ZERO — o corpo INTEIRO. Usa isto SÓ quando for mesmo refazer tudo " +
    "(mudar o título, ou reescrever o texto todo de cabo a rabo). Para mudar UM ponto — uma frase, " +
    "um parágrafo, um trecho — NÃO uses isto: usa `editar_trecho_artefato`, que troca só aquele " +
    "pedaço e deixa o resto intocado (num texto grande, reescrever tudo é onde tu alteras sem querer " +
    "o que não devias). LÊ o artefato antes (ler_artefato) e manda o CORPO INTEIRO reescrito em " +
    "`conteudo`. Opcionalmente muda o `titulo`. Depois, na tua voz, conta o que mudaste — NÃO " +
    "repitas o texto inteiro no chat.",
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
 * A mão CIRÚRGICA — edita um PONTO do artefato sem reescrever o resto. O «Edit tool» do código
 * trazido pra cá: é a forma PREFERIDA de mexer num artefato que já existe (menos tokens, e o
 * que ela não re-emite não pode ser corrompido). Mesma trava `documentosAtivo`.
 */
const FERRAMENTA_EDITAR_TRECHO: DefinicaoFerramenta = {
  nome: "editar_trecho_artefato",
  descricao:
    "Edita um PONTO específico de um artefato sem reescrever o resto — a mão cirúrgica, e a forma " +
    "PREFERIDA de mexer num artefato que já existe. Em vez de mandar o corpo inteiro (onde, num " +
    "texto grande, é fácil alterar sem querer o que não devia), tu passas só o `trecho_antigo` — " +
    "uma cópia EXATA do que está lá agora — e o `trecho_novo` que entra no lugar. O resto do " +
    "artefato fica intocado, literalmente não pode ser corrompido, porque nem passou por ti. Usa " +
    "para corrigir uma frase, trocar um parágrafo, ajustar um ponto: «muda aquela frase», " +
    "«reescreve esse parágrafo», «corrige isso aqui». LÊ o artefato antes (ler_artefato) para " +
    "copiar o trecho tal e qual. O `trecho_antigo` tem de ser ÚNICO no texto — se aparecer mais de " +
    "uma vez, a ferramenta recusa; então alarga-o com mais contexto à volta até ficar único. (Só " +
    "reescreve o corpo INTEIRO com `editar_artefato` quando for mesmo refazer tudo do zero.) " +
    "Depois, na tua voz, conta o que mudaste — não repitas o texto no chat.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato a editar (de listar_artefatos)." },
      trecho_antigo: {
        type: "string",
        description:
          "O texto EXATO que já está no artefato e vai sair — copiado tal e qual (mesma pontuação, " +
          "acentos, espaços e quebras de linha). Tem de ser ÚNICO no artefato; se não for, inclui " +
          "mais texto à volta (a frase ou o parágrafo inteiro) até ficar único.",
      },
      trecho_novo: {
        type: "string",
        description:
          "O texto que entra no lugar do `trecho_antigo`. Pode ser vazio para APAGAR o trecho. " +
          "Escreve só este pedaço — o resto do artefato não muda.",
      },
    },
    required: ["id", "trecho_antigo", "trecho_novo"],
  },
};

/**
 * O SUMÁRIO — «o livro é uma codebase». Devolve só o índice (títulos + tamanho de cada seção),
 * não o corpo. É o que deixa a Luna navegar um artefato GRANDE (um livro, um documento longo) sem
 * o carregar todo e saturar. Mesma trava `documentosAtivo`.
 */
const FERRAMENTA_LER_ESTRUTURA: DefinicaoFerramenta = {
  nome: "ler_estrutura",
  descricao:
    "Mostra o ÍNDICE de um artefato — a lista de seções (títulos ## ) com o tamanho de cada uma, " +
    "SEM trazer o corpo. Usa isto ANTES de ler um artefato GRANDE (um livro, um texto longo, algo " +
    "com vários capítulos/seções): olhas o mapa — que é barato — e decides que seção abrir, em vez " +
    "de carregar o texto inteiro (onde te perdes e confabulas). Depois lê só o que precisas com " +
    "`ler_secao`. Para um artefato pequeno, de uma página, não precisas disto — lê direto.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato (de listar_artefatos ou de quando o criaste)." },
    },
    required: ["id"],
  },
};

/**
 * ABRIR UM CAPÍTULO — lê UMA seção do artefato, não o corpo inteiro. O par de `ler_estrutura`:
 * primeiro olhas o índice, depois puxas só a seção que interessa. Mesma trava `documentosAtivo`.
 */
const FERRAMENTA_LER_SECAO: DefinicaoFerramenta = {
  nome: "ler_secao",
  descricao:
    "Lê UMA seção de um artefato — só aquele pedaço, não o texto todo. Usa depois de `ler_estrutura`: " +
    "viste o índice, agora abres o capítulo que interessa. Diz qual seção em `secao` — o NÚMERO do " +
    "índice (ex.: 3) ou o TÍTULO dela. É assim que trabalhas um artefato grande sem o carregar " +
    "inteiro: mapa primeiro, depois a seção. Para mudar algo dentro dela, `editar_trecho_artefato`.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato (de listar_artefatos)." },
      secao: {
        type: "string",
        description:
          "Qual seção abrir: o NÚMERO do índice (ex.: «3») ou o TÍTULO dela (ex.: «Capítulo 3»). " +
          "Vê os números e títulos em ler_estrutura primeiro.",
      },
    },
    required: ["id", "secao"],
  },
};

/**
 * O GREP do artefato — acha ONDE um termo aparece (contexto + seção de cada ocorrência). O terceiro
 * órgão do «livro é uma codebase»: cobre o que a navegação por seções não pega — uma menção
 * enterrada, inclusive num texto SEM títulos. Mesma trava `documentosAtivo`.
 */
const FERRAMENTA_BUSCAR: DefinicaoFerramenta = {
  nome: "buscar_no_artefato",
  descricao:
    "Procura um termo DENTRO de um artefato e diz ONDE ele aparece — o contexto à volta e em que " +
    "seção, de cada ocorrência. É o teu «localizar»: usa quando ele fala de algo específico num " +
    "artefato grande («onde é que eu falo do orçamento?», «acha a parte do personagem X») e tu " +
    "precisas de ir direto ao ponto, em vez de ler tudo. Funciona mesmo num texto sem seções. " +
    "Ignora acentos e maiúsculas na busca. Depois, abre a seção com `ler_secao` ou troca com " +
    "`editar_trecho_artefato` (copiando o trecho exato do contexto).",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato (de listar_artefatos)." },
      termo: {
        type: "string",
        description: "A palavra ou expressão a procurar (sem diferença de acento/maiúsculas).",
      },
    },
    required: ["id", "termo"],
  },
} satisfies DefinicaoFerramenta;

/**
 * A bíblia do artefato — os fatos fixos que não podem se contradizer entre trechos. É o `AGENTS.md`
 * do texto: as regras que ela relê SEMPRE antes de mexer, injetadas no contexto a cada turno. Mesma
 * trava `documentosAtivo`.
 */
const FERRAMENTA_ANOTAR_CANONE: DefinicaoFerramenta = {
  nome: "anotar_canone",
  descricao:
    "Guarda os FATOS FIXOS de um artefato — os nomes, idades, relações e decisões de mundo que não " +
    "podem se contradizer entre um trecho e outro (ex.: «Marina: arquiteta, 30 anos, mora em Lisboa; " +
    "Pedro é irmão dela»). Esses fatos aparecem à tua frente sempre que mexeres neste artefato, mesmo " +
    "num livro grande onde só vês o índice — é assim que não trocas o nome de um personagem entre " +
    "capítulos. Passa a lista COMPLETA e atualizada (tu já tens o cânone atual no contexto): junta o " +
    "fato novo, corrige o que mudou. Usa quando ele ESTABELECE algo do mundo/personagens, ou quando " +
    "tu mesma fixas um fato ao escrever.",
  parametros: {
    type: "object",
    properties: {
      id: { type: "string", description: "O id do artefato (de listar_artefatos)." },
      notas: {
        type: "string",
        description:
          "A lista COMPLETA e atualizada dos fatos fixos, em Markdown curto (um fato por linha). " +
          "Substitui o cânone anterior — reescreve-o inteiro com o que mudou.",
      },
    },
    required: ["id", "notas"],
  },
} satisfies DefinicaoFerramenta;

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
    FERRAMENTA_REGISTRAR_LANCAMENTO,
    FERRAMENTA_LISTAR_LANCAMENTOS,
    FERRAMENTA_RESUMO_FINANCEIRO,
    FERRAMENTA_GERIR_RECORRENTE,
    FERRAMENTA_GERIR_CARTEIRA,
    FERRAMENTA_GERIR_META,
    FERRAMENTA_TRANSFERIR,
  ];
  // Documentos: só no ambiente que os ativa (OrbitLab). Fora dele, as ferramentas nem existem.
  if (opcoes.documentosAtivo) {
    ferramentas.push(FERRAMENTA_CRIAR_DOCUMENTO);
    ferramentas.push(FERRAMENTA_LISTAR_DOCUMENTOS);
    ferramentas.push(FERRAMENTA_LER_DOCUMENTO);
    ferramentas.push(FERRAMENTA_LER_ESTRUTURA);
    ferramentas.push(FERRAMENTA_LER_SECAO);
    ferramentas.push(FERRAMENTA_BUSCAR);
    ferramentas.push(FERRAMENTA_EDITAR_TRECHO);
    ferramentas.push(FERRAMENTA_EDITAR_DOCUMENTO);
    ferramentas.push(FERRAMENTA_ANOTAR_CANONE);
    ferramentas.push(FERRAMENTA_GERAR_IMAGEM);
    ferramentas.push(FERRAMENTA_EDITAR_IMAGEM);
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
