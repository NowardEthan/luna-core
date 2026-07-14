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
  /** Ativa/desativa o bloco de raciocínio visível. */
  reasoningEnabled: z.boolean().optional(),
  /** Nível de raciocínio: baixo, médio ou alto. */
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
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
  code?: "quota_exceeded";
  quotaKind?: string;
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
  };
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
