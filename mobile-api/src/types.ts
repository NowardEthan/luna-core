import { z } from "zod";

/** Aceita valores legados (openrouter, qwen-*) — normalizados no servidor. */
export const LlmProviderIdSchema = z.enum(["groq", "cerebras", "openrouter", "auto"]);
export const LlmModelKeySchema = z.enum(["default", "glm-47", "gpt-oss-120b", "qwen-next", "qwen-coder", "auto"]);

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(16_000),
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
