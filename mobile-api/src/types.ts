import { z } from "zod";

/** Aceita valores legados (openrouter, qwen-*) — normalizados no servidor. */
export const LlmProviderIdSchema = z.enum(["groq", "cerebras", "openrouter", "auto"]);
export const LlmModelKeySchema = z.enum(["default", "glm-47", "gpt-oss-120b", "qwen-next", "qwen-coder", "auto"]);

export const ChatRequestSchema = z.object({
  /**
   * A mensagem carrega o bloco [Anexos] — o CONTEÚDO dos documentos vai aqui dentro
   * (o PDF/MD/HTML extraído). O teto era 16.000 chars: qualquer documento com mais de
   * ~15 páginas era REJEITADO com 400, e a Luna nunca via o arquivo. Pior: o servidor
   * já tinha `truncateMobileChatMessage`, feito para encolher anexos de até 100k — só
   * que o Zod barrava antes, e essa lógica nunca corria. Era código morto.
   *
   * Agora aceitamos o que o app pode enviar (100k por arquivo × até 5) e deixamos o
   * corte para quem sabe fazê-lo: o truncador, que conhece a janela de cada provedor.
   */
  message: z.string().min(1).max(600_000),
  /**
   * Texto LIMPO do usuário (sem o enriquecimento de anexos) para exibir/derivar
   * título no Firestore. Ausente → cai no `message`.
   */
  displayMessage: z.string().max(16_000).optional(),
  sessionId: z.string().min(1).max(128).optional(),
  userMessageId: z.string().min(1).max(128).optional(),
  lunaMessageId: z.string().min(1).max(128).optional(),
  /** Provedor LLM (legado: openrouter → Groq). */
  providerId: LlmProviderIdSchema.optional(),
  /** Variante do modelo (legado: qwen-* → default). */
  modelKey: LlmModelKeySchema.optional(),
  /** Nome preferido do utilizador (perfil/conta) — evita confundir com «Luna». */
  userDisplayName: z.string().min(1).max(64).optional(),
  /** Fuso IANA do dispositivo (ex.: "America/Sao_Paulo") — grounding temporal. */
  timeZone: z.string().min(1).max(64).optional(),
  /**
   * Localização + clima atuais do dispositivo — grounding ESPACIAL (opt-in por
   * permissão). O app capta o GPS, resolve cidade/uf pelo Geocoder e busca o clima
   * no Open-Meteo; o servidor só formata. Ausente → a Luna segue só com o relógio.
   */
  local: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      cidade: z.string().min(1).max(120).optional(),
      uf: z.string().min(1).max(80).optional(),
      pais: z.string().min(1).max(80).optional(),
      clima: z
        .object({
          tempC: z.number().min(-90).max(60).optional(),
          sensacaoC: z.number().min(-90).max(70).optional(),
          umidade: z.number().min(0).max(100).optional(),
          ventoKmh: z.number().min(0).max(500).optional(),
          codigo: z.number().int().min(0).max(99).optional(),
          descricao: z.string().min(1).max(120).optional(),
          maxC: z.number().min(-90).max(60).optional(),
          minC: z.number().min(-90).max(60).optional(),
          chuvaProb: z.number().min(0).max(100).optional(),
          chuvaMm: z.number().min(0).max(1000).optional(),
          previsao: z
            .array(
              z.object({
                rotulo: z.string().min(1).max(24).optional(),
                maxC: z.number().min(-90).max(60).optional(),
                minC: z.number().min(-90).max(60).optional(),
                chuvaProb: z.number().min(0).max(100).optional(),
                codigo: z.number().int().min(0).max(99).optional(),
                descricao: z.string().min(1).max(120).optional(),
              }),
            )
            .max(7)
            .optional(),
        })
        .optional(),
    })
    .optional(),
  /** Ativa/desativa o bloco de raciocínio visível. */
  reasoningEnabled: z.boolean().optional(),
  /** Nível de raciocínio: baixo, médio ou alto. */
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  /** Modo pesquisa profunda (opt-in): libera o cruzamento de fontes antes de escrever. */
  pesquisaProfunda: z.boolean().optional(),
  /** Modo técnico (opt-in): registro detalhista/rigoroso em vez da voz calorosa de sempre. */
  modoTecnico: z.boolean().optional(),
  /** Artefatos ativos (opt-in): libera a ferramenta `criar_artefato`. Só o OrbitLab liga, por ora. */
  documentosAtivo: z.boolean().optional(),
  /** Modo "Mãos à obra" (opt-in): força o caminho agêntico em todo turno. Só o OrbitLab liga. */
  modoAgentico: z.boolean().optional(),
  /**
   * Conversa dedicada do módulo Finanças (OrbitLab). Injeta briefing + pré-carga
   * pra Luna saber que está ali falando de grana — não só quando a mensagem cita real.
   */
  moduloFinancas: z.boolean().optional(),
  /**
   * «Reenviar»: quando o usuário refaz uma mensagem, o app trunca a conversa e manda aqui
   * o histórico ANTERIOR (autoritativo, já truncado). O servidor reescreve o buffer da
   * sessão com ele antes do turno — senão a fala antiga sobrevive no buffer quente e a Luna
   * responde «você já me disse isso». Vazio = reenvio da 1ª mensagem (buffer volta a zero).
   */
  reenvio: z
    .object({
      historico: z
        .array(
          z.object({
            papel: z.enum(["user", "assistant"]),
            conteudo: z.string().max(16_000),
          }),
        )
        .max(200),
    })
    .optional(),
  /**
   * Anexos visuais (imagem/vídeo) do turno, para a visão agêntica no core.
   *
   * Preferimos `url` (Firebase Storage): o modelo de visão busca o arquivo direto,
   * o payload fica leve e não há teto prático de tamanho. `imageBase64` continua
   * aceito como alternativa (modo offline/sem nuvem) — mas aí o vídeo esbarra no
   * limite do JSON. Um dos dois é obrigatório.
   */
  attachments: z
    .array(
      z
        .object({
          id: z.string().min(1).max(128).optional(),
          name: z.string().min(1).max(256).optional(),
          mimeType: z.string().min(1).max(64).optional(),
          url: z.string().url().max(2_048).optional(),
          imageBase64: z.string().min(32).max(20_000_000).optional(),
        })
        .refine((a) => Boolean(a.url || a.imageBase64), {
          message: "Anexo precisa de `url` ou `imageBase64`.",
        }),
    )
    .max(5)
    .optional(),
  /**
   * Documentos do turno (PDF/DOCX/MD/TXT…). NÃO viajam dentro da `message`: o app manda
   * a URL do Storage, o servidor extrai o texto e a Luna lê por PARTES, com `ler_arquivo`.
   * Um PDF de 110 páginas não cabe num prompt — e antes era cortado a meio, sem ela saber.
   */
  documents: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        name: z.string().min(1).max(256).optional(),
        mimeType: z.string().min(1).max(128).optional(),
        url: z.string().url().max(2_048),
      }),
    )
    .max(5)
    .optional(),
  /**
   * URL da arte da Luna que o usuário REFERENCIOU neste turno (swipe numa imagem anterior).
   * O `editar_imagem` usa isto como BASE em vez da última gerada na conversa.
   */
  imagemBaseEdicao: z.string().url().max(2_048).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatResponseOk = {
  ok: true;
  text: string;
  sessionId: string;
  turnCount: number;
  providerId?: string;
  modelKey?: string;
  providerReason?: string;
  autoMode?: boolean;
  humor_atual?: {
    emoji: string;
    label: string;
    tema: string;
    narrativa?: string;
    accessibilityLabel: string;
  };
  /** true quando o turno já existia (retry de rede) — não recontar quota no cliente. */
  idempotent?: boolean;
  /** `reduced` quando a quota do plano esgotou e o pedido usou o tier free Cerebras. */
  quotaMode?: "plan" | "reduced";
};

export type ChatResponseErr = {
  ok: false;
  error: string;
  /** `quota_exceeded` = carteira do plano; `rate_limited` = anti-rajada (≠ cota). */
  code?: "quota_exceeded" | "rate_limited";
  quotaKind?: string;
  /** Quando a cota renova (epoch ms) — o cliente mostra "renova em X". */
  resetsAtMs?: number;
  /** Qual janela estourou: rolante (5h) ou semanal. */
  cycle?: "window" | "weekly";
  /** Segundos sugeridos pra retry (só em `rate_limited`). */
  retryAfterSec?: number;
};

export type ChatResponse = ChatResponseOk | ChatResponseErr;

export type TranscribeResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type VisionResponse =
  | { ok: true; descriptions: Array<{ name?: string; description: string }> }
  | { ok: false; error: string };

export type ExtractDocumentsResponse =
  | { ok: true; documents: Array<{ name?: string; text: string; truncated?: boolean }> }
  | { ok: false; error: string };

export const RosaryReflectionRequestSchema = z.object({
  mysteryName: z.string().min(1).max(256),
  mysterySetLabel: z.string().min(1).max(64),
  intention: z.string().max(500).optional(),
});

export type RosaryReflectionRequest = z.infer<typeof RosaryReflectionRequestSchema>;

export type RosaryReflectionResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Batizar conversa — espelho do antigo LunaTitler (cliente). */
export const TituloConversaRequestSchema = z.object({
  mensagens: z
    .array(
      z.object({
        papel: z.enum(["user", "luna"]),
        texto: z.string().max(500),
      }),
    )
    .min(1)
    .max(10),
});

export type TituloConversaRequest = z.infer<typeof TituloConversaRequestSchema>;

export type TituloConversaResponse =
  | { ok: true; title: string }
  | { ok: false; error: string };

export type HealthResponse = {
  ok: true;
  service: "luna-mobile-api";
  corePath: string;
  coreReady: boolean;
  llmConfigured: boolean;
  sttConfigured: boolean;
  visionConfigured: boolean;
  /** Este deploy aceita anexo por URL do Storage (e não só base64). */
  attachmentUrlSupported?: boolean;
  /**
   * O que ESTE deploy sabe fazer. Existe porque `ok: true` não prova nada: um deploy
   * falhado deixa o ANTERIOR de pé, respondendo ok, e é fácil concluir que a correção
   * subiu quando não subiu. (Aconteceu: 4 deploys falharam e o /health continuou verde.)
   */
  features?: {
    /** Memória entre conversas protegida no briefing (não é mais descartada). */
    recallEntreConversas: boolean;
    /** Diário e sono persistem no Firestore — ela consegue evoluir. */
    diarioSono: boolean;
    /** Ferramenta `ler_arquivo`: documentos grandes lidos por partes. */
    leitorDeArquivos: boolean;
    /** Detetores + reescritor: ela fala livre e o excesso é cortado depois. */
    linhaDeRevisao: boolean;
    /** Um revisor externo procura o furo — ela diz a verdade em vez de agradar. */
    neuronioObjecao: boolean;
    /** Não finge lembrar de um passado que nunca houve: o sistema verifica. */
    verificadorPremissa: boolean;
    /** Sabe onde ele está («ele está no ônibus, faltam-lhe 20min») e repara quando ele some. */
    neuronioRotina: boolean;
    /** As quatro mãos: ver, criar, editar, apagar blocos da rotina. */
    maosDaRotina: boolean;
    /** A Luna vê só a rotina que vigora hoje (de férias, não cobra o trabalho). */
    rotinasProgramaveis: boolean;
    /** Direito de exclusão (LGPD): apaga conta + todos os dados num toque. */
    apagarConta: boolean;
    /** Busca semântica na conversa (a Luna acha pelo significado, não só a palavra). */
    buscaSemantica: boolean;
    /** L4: turno leve (casual) usa dieta de briefing + sem CoT na voz. */
    dietaWritingLeve: boolean;
    /** L3: no leve/simples, intenção e memória pré-voz usam regras (sem LLM extra). */
    gatePrevozLeve: boolean;
    /** Carteira reprecificada: chat generoso; imagem gerada + pesquisa profunda pesam. */
    carteiraLagostas: boolean;
    /** Erro de cota traz resetsAtMs/cycle — o app mostra "renova em X". */
    quotaResetsAtMs: boolean;
    /** Bolha da Luna no Firestore traz imagens[]; guarda corta narração sem URL. */
    imagemPersistidaComGuarda: boolean;
    /** Imagem gerada conta na cota (mesmo com overdraft) + roteamento arte/realista. */
    imagemCotaERoteamento: boolean;
    /** Plano no teto → 429 (sem continuar falando de graça no OpenRouter). */
    cotaHardStop: boolean;
    /**
     * Referência/swipe + «faz realista» → edita a base (i2i), não gera do zero.
     * Evita Riverflow inventar outro assunto (ex. sofá → rosto).
     */
    imagemRefContinuidade: boolean;
    /** Middleware in-memory uid+IP; 429 com `code: "rate_limited"` (≠ cota). */
    rateLimit: boolean;
    /** POST /v1/conversa/titulo — batiza a conversa no servidor (sem OpenRouter no APK). */
    tituloConversa: boolean;
    /** Orientação + autoauditoria de artefatos (ler antes, conferir depois, coleiras). */
    auditoriaArtefato: boolean;
    /** Legado: Qwen 3.6 Plus como default pago (agora false — DeepSeek V4 Pro). */
    qwenPlusAgentico: boolean;
    /** Cérebro pago = DeepSeek V4 Pro (prosa/livro); coleiras de artefato ativas. */
    deepseekV4ProAgentico: boolean;
    /** Thinking/reasoning pedido em pt-BR (Qwen nativo incluso). */
    thinkingPtBr: boolean;
    /** Reasoning não é streamado cru; done só leva texto sanitizado (anti-vazamento). */
    thinkingSanitizado: boolean;
    /** Pedido ambíguo com artefato na conversa → perguntar continuar vs criar outro. */
    escolhaArtefato: boolean;
    /** Canone com CRUD pontual (adicionar/editar/apagar). */
    canoneCrud: boolean;
    /** Bloqueia ler_secao em ping-pong no mesmo turno agentico. */
    antiLoopSecaoArtefato: boolean;
    /** Coleira do plano exige marcar todos os ? e falar o fecho com o usu�rio. */
    planoFechoComFala: boolean;
    /** Stream token-a-token no path agentico com tools. */
    streamAgenticoFino: boolean;
    /** Tool consultar_neuronio (subagente orientacao/auditoria). */
    neuronioSubagente: boolean;
  };
  /**
   * O commit que está a correr AQUI.
   *
   * Uma feature booleana só distingue deploys enquanto a feature é nova. Ontem verifiquei um
   * deploy com `neuronioRotina` — que já existia no deploy ANTERIOR — e o meu vigia disse
   * «ok» sem provar nada. Um marcador que não distingue não é um marcador, é um espelho.
   *
   * O SHA distingue sempre.
   */
  commit?: string;
  documentExtractAvailable: boolean;
  firebaseConfigured: boolean;
  firebaseAuthRequired: boolean;
  billingConfigured?: boolean;
  llmProviders?: Array<{
    providerId: string;
    modelKey: string;
    label: string;
    description: string;
    modelId: string;
  }>;
  /** true quando Cerebras está configurado e streaming SSE está activo. */
  streamSupported?: boolean;
  /** Modo de persistência do Mundo Interior (firestore | sqlite). */
  lunaStore?: string;
  /** Pesquisa web Tavily configurada no servidor. */
  webSearchConfigured?: boolean;
};
