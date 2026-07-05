import { z } from "zod";

/** Aceita valores legados (openrouter, qwen-*) — normalizados no servidor. */
export const LlmProviderIdSchema = z.enum(["groq", "cerebras", "openrouter", "auto"]);
export const LlmModelKeySchema = z.enum(["default", "glm-47", "qwen-next", "qwen-coder", "auto"]);

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(16_000),
  sessionId: z.string().min(1).max(128).optional(),
  userMessageId: z.string().min(1).max(128).optional(),
  lunaMessageId: z.string().min(1).max(128).optional(),
  /** Provedor LLM (legado: openrouter → Groq). */
  providerId: LlmProviderIdSchema.optional(),
  /** Variante do modelo (legado: qwen-* → default). */
  modelKey: LlmModelKeySchema.optional(),
  /** Nome preferido do utilizador (perfil/conta) — evita confundir com «Luna». */
  userDisplayName: z.string().min(1).max(64).optional(),
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
};

export type ChatResponseErr = {
  ok: false;
  error: string;
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

export type HealthResponse = {
  ok: true;
  service: "luna-mobile-api";
  corePath: string;
  coreReady: boolean;
  llmConfigured: boolean;
  sttConfigured: boolean;
  visionConfigured: boolean;
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
};
