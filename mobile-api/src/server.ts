import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

import {
  isFirebaseAdminConfigured,
  isFirebaseAuthRequired,
  verifyFirebaseBearer,
} from "./firebaseAdmin.js";
import { deveUsarPersistenciaFirestore } from "./persistenciaFirestore.js";
import { persistChatTurn } from "./firestoreChat.js";
import { buscarTurnoCacheado } from "./idempotenciaChat.js";
import { executarChatMobile, executarChatMobileStream, type ChatMobileResult } from "./loadCore.js";
import { isCoreBuilt, resolveLunaCorePath } from "./resolveCorePath.js";
import { isSttConfigured, transcribeAudio, TranscribeRequestSchema } from "./transcribeStt.js";
import {
  describeImages,
  isVisionConfigured,
  VisionRequestSchema,
} from "./describeVision.js";
import {
  extractDocuments,
  ExtractDocumentsRequestSchema,
  isDocumentExtractAvailable,
} from "./extractDocuments.js";
import {
  assertTokensAvailable,
  consumeTokens,
  getQuotaSnapshot,
  getUserPlanId,
  QuotaExceededError,
  resolveQuotaForRequest,
  type QuotaRequestMode,
} from "./billing/quotaService.js";
import {
  consumeReducedTokens,
  ReducedQuotaExceededError,
} from "./billing/reducedQuota.js";
import {
  estimarApiTokensChat,
  estimarCustoMinimoChat,
  estimarInputTokensChat,
  estimarTokensChat,
  estimarTokensDocumentos,
  estimarTokensTranscricao,
  estimarTokensVisao,
} from "./billing/tokenEstimate.js";
import {
  REDUCED_LLM_SELECTION,
  resolveLlmProviderSelection,
  type LlmProviderSelection,
} from "./llmProviders.js";
import { planIdForLlmRouting } from "./billing/planModelPolicy.js";
import type { PlanId } from "./billing/planMapping.js";
import {
  isAnyLlmProviderConfigured,
  isStreamSupported,
  listProviderOptionsForHealth,
  listProviderOptionsForUi,
} from "./llmProviders.js";
import { handleBillingRoute, isBillingConfigured } from "./billing/billingRoutes.js";
import { generateRosaryReflection } from "./rosaryReflection.js";
import {
  ChatRequestSchema,
  type ChatRequest,
  type ChatResponse,
  type ExtractDocumentsResponse,
  type HealthResponse,
  RosaryReflectionRequestSchema,
  type RosaryReflectionResponse,
  type TranscribeResponse,
  type VisionResponse,
} from "./types.js";
import { mapearErroParaEventoSse } from "../../dist/ux/mapearErroUsuario.js";

/**
 * Carrega o .env da luna-core no arranque, para que LUNA_API_KEY (chat + STT)
 * esteja disponível antes do primeiro /v1/chat — senão /v1/transcribe falha
 * quando um áudio é o primeiro pedido. No Railway as Variables já vêm no env.
 */
function bootstrapEnvFromCore(): void {
  const loadEnvFile = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof loadEnvFile !== "function") return;
  try {
    const envPath = join(resolveLunaCorePath(), ".env");
    if (existsSync(envPath)) loadEnvFile(envPath);
  } catch {
    /* .env opcional — ignora se ausente ou ilegível */
  }
}

bootstrapEnvFromCore();

if (isFirebaseAdminConfigured() && !process.env.LUNA_STORE?.trim()) {
  process.env.LUNA_STORE = "firestore";
}

const HOST = process.env.LUNA_MOBILE_API_HOST?.trim() || "0.0.0.0";
/** Railway injecta PORT; local usa LUNA_MOBILE_API_PORT ou 7742. */
const PORT = Number(process.env.PORT ?? process.env.LUNA_MOBILE_API_PORT ?? 7742);

function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    ...extra,
  };
}

function sendSseEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendMappedSseError(res: ServerResponse, erro: unknown): void {
  sendSseEvent(res, "error", mapearErroParaEventoSse(erro));
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

function readAuthHeader(req: IncomingMessage): string | undefined {
  const raw = req.headers.authorization;
  return typeof raw === "string" ? raw : undefined;
}

function quotaDeniedPayload(
  err: QuotaExceededError | ReducedQuotaExceededError,
): { ok: false; error: string; code: "quota_exceeded"; quotaKind: string } {
  const kind = err instanceof ReducedQuotaExceededError ? "reduced" : err.kind;
  return {
    ok: false,
    error: err.message,
    code: "quota_exceeded",
    quotaKind: kind,
  };
}

function chatTimeoutMs(): number {
  const raw = process.env.LUNA_CHAT_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 90_000;
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

async function comTimeoutChat<T>(promise: Promise<T>, ms = chatTimeoutMs()): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "A Luna demorou demais para responder. Tenta de novo — se persistir, verifica CEREBRAS_API_KEY no Railway.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function denyIfInsufficientTokens(
  auth: Awaited<ReturnType<typeof verifyFirebaseBearer>>,
  tokens: number,
): Promise<QuotaExceededError | null> {
  if (!auth || tokens < 1) return null;
  try {
    await assertTokensAvailable(auth.uid, tokens);
    return null;
  } catch (err) {
    if (err instanceof QuotaExceededError) return err;
    throw err;
  }
}

async function chargeTokens(
  auth: Awaited<ReturnType<typeof verifyFirebaseBearer>>,
  tokens: number,
): Promise<void> {
  if (!auth || tokens < 1) return;
  await consumeTokens(auth.uid, tokens);
}

type TurnoResolvido = {
  result: ChatMobileResult;
  idempotent: boolean;
  quotaMode?: QuotaRequestMode;
};

async function resolverTurnoChat(params: {
  auth: Awaited<ReturnType<typeof verifyFirebaseBearer>>;
  sessionId: string;
  parsed: ChatRequest;
  llmSelection: LlmProviderSelection;
  planId: PlanId;
}): Promise<TurnoResolvido> {
  const { auth, sessionId, parsed, llmSelection, planId } = params;

  if (auth && parsed.lunaMessageId) {
    const cached = await buscarTurnoCacheado(auth.uid, sessionId, parsed.lunaMessageId);
    if (cached) {
      return {
        idempotent: true,
        result: {
          text: cached.text,
          sessionId,
          turnCount: 0,
          provider: llmSelection,
          humor_atual: cached.humor_atual,
        },
      };
    }
  }

  const attCount = parsed.attachments?.length ?? 0;
  let quotaMode: QuotaRequestMode = "plan";
  let effectiveSelection = llmSelection;

  if (auth) {
    const quota = await resolveQuotaForRequest(
      auth.uid,
      estimarCustoMinimoChat(parsed.message, attCount),
      estimarInputTokensChat(parsed.message, attCount),
    );
    quotaMode = quota.mode;
    if (quotaMode === "reduced") {
      effectiveSelection = REDUCED_LLM_SELECTION;
    }
  }

  const result = await comTimeoutChat(
    executarChatMobile(
      parsed.message,
      sessionId,
      parsed.attachments,
      effectiveSelection,
      parsed.userDisplayName,
      auth?.uid ?? null,
      planId,
    ),
  );

  if (auth) {
    await persistChatTurn({
      uid: auth.uid,
      sessionId: result.sessionId,
      userMessage: parsed.message,
      lunaReply: result.text,
      userMessageId: parsed.userMessageId,
      lunaMessageId: parsed.lunaMessageId,
      humor_atual: result.humor_atual,
    });
    if (quotaMode === "plan") {
      await chargeTokens(auth, estimarTokensChat(parsed.message, result.text, attCount));
    } else {
      await consumeReducedTokens(
        auth.uid,
        estimarApiTokensChat(parsed.message, result.text, attCount),
        estimarInputTokensChat(parsed.message, attCount),
      );
    }
  }

  return { idempotent: false, result, quotaMode };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const billingHandled = await handleBillingRoute(
    req,
    res,
    url.pathname,
    sendJson,
    readAuthHeader,
  );
  if (billingHandled) return;

  if (method === "GET" && url.pathname === "/v1/billing/usage") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      console.log(`[server] GET /v1/billing/usage uid=${auth?.uid ?? "none"} isAnonymous=${auth?.isAnonymous ?? "n/a"}`);
      if (isFirebaseAuthRequired() && !auth) {
        return sendJson(res, 401, { ok: false, error: "Autenticação Firebase obrigatória." });
      }
      if (!auth) {
        return sendJson(res, 401, { ok: false, error: "Autenticação Firebase obrigatória." });
      }
      const usage = await getQuotaSnapshot(auth.uid);
      console.log(`[server] GET /v1/billing/usage response uid=${auth.uid} usedTokens=${usage.usedTokens} remaining=${usage.remainingTokens} planId=${usage.planId}`);
      return sendJson(res, 200, { ok: true, usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, 500, { ok: false, error: message });
    }
  }

  if (method === "POST" && url.pathname === "/v1/rosary/reflection") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      if (isFirebaseAuthRequired() && !auth) {
        return sendJson(res, 401, { ok: false, error: "Autenticação Firebase obrigatória." } satisfies RosaryReflectionResponse);
      }
      const body = await readJson(req);
      const parsed = RosaryReflectionRequestSchema.parse(body);
      const text = await generateRosaryReflection(parsed);
      return sendJson(res, 200, { ok: true, text } satisfies RosaryReflectionResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, 400, { ok: false, error: message } satisfies RosaryReflectionResponse);
    }
  }

  if (method === "GET" && url.pathname === "/health") {
    const corePath = resolveLunaCorePath();
    const firebaseConfigured = isFirebaseAdminConfigured();
    const llmProviders = listProviderOptionsForHealth().map((o) => ({
      providerId: o.providerId,
      modelKey: o.modelKey,
      label: o.label,
      description: o.description,
      modelId: o.modelId,
    }));
    const payload: HealthResponse = {
      ok: true,
      service: "luna-mobile-api",
      corePath,
      coreReady: isCoreBuilt(corePath),
      llmConfigured: isAnyLlmProviderConfigured(),
      sttConfigured: isSttConfigured(),
      visionConfigured: isVisionConfigured(),
      documentExtractAvailable: isDocumentExtractAvailable(),
      firebaseConfigured,
      firebaseAuthRequired: isFirebaseAuthRequired(),
      billingConfigured: isBillingConfigured(),
      llmProviders,
      streamSupported: isStreamSupported(),
      lunaStore: process.env.LUNA_STORE ?? "sqlite",
      webSearchConfigured: Boolean(
        process.env.TAVILY_API_KEY?.trim() || process.env.WEB_SEARCH_API_KEY?.trim(),
      ),
    };
    return sendJson(res, payload.coreReady && payload.llmConfigured ? 200 : 503, payload);
  }

  if (method === "POST" && url.pathname === "/v1/chat") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      if (isFirebaseAuthRequired() && !auth) {
        const payload: ChatResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória. Envia Authorization: Bearer <idToken>.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = ChatRequestSchema.parse(body);
      const sessionId = parsed.sessionId ?? crypto.randomUUID();

      let planId: PlanId = "free";
      if (auth && !auth.isAnonymous) {
        planId = planIdForLlmRouting(auth.uid, await getUserPlanId(auth.uid));
      }

      const resolvedLlm = resolveLlmProviderSelection(
        {
          providerId: parsed.providerId,
          modelKey: parsed.modelKey,
        } as Partial<LlmProviderSelection>,
        parsed.message,
        planId,
      );
      if (!resolvedLlm) {
        const payload: ChatResponse = {
          ok: false,
          error: "Nenhum provedor de LLM configurado para este plano.",
        };
        return sendJson(res, 503, payload);
      }
      const llmSelection = resolvedLlm.selection;

      let turno: TurnoResolvido;
      try {
        turno = await resolverTurnoChat({
          auth,
          sessionId,
          parsed,
          llmSelection,
          planId,
        });
      } catch (err) {
        if (err instanceof QuotaExceededError || err instanceof ReducedQuotaExceededError) {
          return sendJson(res, 429, quotaDeniedPayload(err) satisfies ChatResponse);
        }
        throw err;
      }

      const { result, idempotent, quotaMode } = turno;

      const payload: ChatResponse = {
        ok: true,
        text: result.text,
        sessionId: result.sessionId,
        turnCount: result.turnCount,
        providerId: result.provider.providerId,
        modelKey: result.provider.modelKey,
        providerReason: result.providerReason,
        autoMode: result.autoMode,
        humor_atual: result.humor_atual,
        idempotent,
        quotaMode,
      };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const payload: ChatResponse = { ok: false, error: message };
      return sendJson(res, 400, payload);
    }
  }

  if (method === "POST" && url.pathname === "/v1/chat/stream") {
    let sseStarted = false;
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      if (isFirebaseAuthRequired() && !auth) {
        const payload: ChatResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória. Envia Authorization: Bearer <idToken>.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = ChatRequestSchema.parse(body);
      const sessionId = parsed.sessionId ?? crypto.randomUUID();

      let planId: PlanId = "free";
      if (auth && !auth.isAnonymous) {
        planId = planIdForLlmRouting(auth.uid, await getUserPlanId(auth.uid));
      }

      const resolvedLlm = resolveLlmProviderSelection(
        {
          providerId: parsed.providerId,
          modelKey: parsed.modelKey,
        } as Partial<LlmProviderSelection>,
        parsed.message,
        planId,
      );
      if (!resolvedLlm) {
        const payload: ChatResponse = {
          ok: false,
          error: "Nenhum provedor de LLM configurado para este plano.",
        };
        return sendJson(res, 503, payload);
      }
      const llmSelection = resolvedLlm.selection;

      if (auth && parsed.lunaMessageId) {
        const cached = await buscarTurnoCacheado(auth.uid, sessionId, parsed.lunaMessageId);
        if (cached) {
          res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
            ...corsHeaders(),
          });
          sendSseEvent(res, "content", { delta: cached.text });
          sendSseEvent(res, "done", {
            text: cached.text,
            sessionId,
            providerId: llmSelection.providerId,
            modelKey: llmSelection.modelKey,
            turnCount: 0,
            humor_atual: cached.humor_atual,
          });
          res.end();
          return;
        }
      }

      const streamAttCount = parsed.attachments?.length ?? 0;
      let streamQuotaMode: QuotaRequestMode = "plan";
      let streamSelection = llmSelection;

      if (auth) {
        const quota = await resolveQuotaForRequest(
          auth.uid,
          estimarCustoMinimoChat(parsed.message, streamAttCount),
          estimarInputTokensChat(parsed.message, streamAttCount),
        );
        streamQuotaMode = quota.mode;
        if (streamQuotaMode === "reduced") {
          streamSelection = REDUCED_LLM_SELECTION;
        }
      }

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        ...corsHeaders(),
      });
      sseStarted = true;

      const streamTimeout = setTimeout(() => {
        sendMappedSseError(res, new Error("Timeout de streaming (120s)."));
        res.end();
      }, 120_000);

      const result = await executarChatMobileStream(
        parsed.message,
        {
          onStatus: (phase) => sendSseEvent(res, "status", { phase }),
          onReasoningDelta: (delta) => sendSseEvent(res, "reasoning", { delta }),
          onContentDelta: (delta) => sendSseEvent(res, "content", { delta }),
          onAcao: (acao) => sendSseEvent(res, "acao", acao),
        },
        sessionId,
        parsed.attachments,
        streamSelection,
        parsed.userDisplayName,
        auth?.uid ?? null,
        planId,
      );

      clearTimeout(streamTimeout);

      if (auth) {
        await persistChatTurn({
          uid: auth.uid,
          sessionId: result.sessionId,
          userMessage: parsed.message,
          lunaReply: result.text,
          userMessageId: parsed.userMessageId,
          lunaMessageId: parsed.lunaMessageId,
          humor_atual: result.humor_atual,
        });
        if (streamQuotaMode === "plan") {
          await chargeTokens(
            auth,
            estimarTokensChat(parsed.message, result.text, streamAttCount),
          );
        } else {
          await consumeReducedTokens(
            auth.uid,
            estimarApiTokensChat(parsed.message, result.text, streamAttCount),
            estimarInputTokensChat(parsed.message, streamAttCount),
          );
        }
      }

      sendSseEvent(res, "done", {
        text: result.text,
        reasoning: result.reasoning,
        sessionId: result.sessionId,
        providerId: result.provider.providerId,
        modelKey: result.provider.modelKey,
        turnCount: result.turnCount,
        providerReason: result.providerReason,
        autoMode: result.autoMode,
        humor_atual: result.humor_atual,
        quotaMode: streamQuotaMode,
      });
      res.end();
    } catch (err) {
      if (sseStarted) {
        sendMappedSseError(res, err);
        res.end();
      } else if (err instanceof QuotaExceededError || err instanceof ReducedQuotaExceededError) {
        return sendJson(res, 429, quotaDeniedPayload(err) satisfies ChatResponse);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const payload: ChatResponse = { ok: false, error: message };
        return sendJson(res, 400, payload);
      }
    }
    return;
  }

  if (method === "POST" && url.pathname === "/v1/transcribe") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      if (isFirebaseAuthRequired() && !auth) {
        const payload: TranscribeResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = TranscribeRequestSchema.parse(body);

      const denied = await denyIfInsufficientTokens(auth, estimarTokensTranscricao(""));
      if (denied) {
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies TranscribeResponse);
      }

      const text = await transcribeAudio(parsed);
      await chargeTokens(auth, estimarTokensTranscricao(text));
      const payload: TranscribeResponse = { ok: true, text };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const payload: TranscribeResponse = { ok: false, error: message };
      return sendJson(res, 400, payload);
    }
  }

  if (method === "POST" && url.pathname === "/v1/vision") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      console.log(`[server] /v1/vision auth uid=${auth?.uid ?? "none"} isAnonymous=${auth?.isAnonymous ?? "n/a"}`);
      if (isFirebaseAuthRequired() && !auth) {
        const payload: VisionResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = VisionRequestSchema.parse(body);
      console.log(`[server] /v1/vision images=${parsed.images.length}`);

      const denied = await denyIfInsufficientTokens(
        auth,
        estimarTokensVisao(parsed.images.length),
      );
      if (denied) {
        console.log(`[server] /v1/vision quota denied`);
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies VisionResponse);
      }

      const descriptions = await describeImages(parsed);
      await chargeTokens(auth, estimarTokensVisao(parsed.images.length));
      console.log(`[server] /v1/vision ok descriptions=${descriptions.length}`);
      const payload: VisionResponse = { ok: true, descriptions };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[server] /v1/vision error`, message);
      const payload: VisionResponse = { ok: false, error: message };
      return sendJson(res, 400, payload);
    }
  }

  if (method === "POST" && url.pathname === "/v1/extract-documents") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      console.log(`[server] /v1/extract-documents auth uid=${auth?.uid ?? "none"} isAnonymous=${auth?.isAnonymous ?? "n/a"}`);
      if (isFirebaseAuthRequired() && !auth) {
        const payload: ExtractDocumentsResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      console.log(`[server] /v1/extract-documents body`, { files: (body as { files?: unknown[] })?.files?.length ?? 0 });
      const parsed = ExtractDocumentsRequestSchema.parse(body);

      const denied = await denyIfInsufficientTokens(
        auth,
        estimarTokensDocumentos(parsed.files.length),
      );
      if (denied) {
        console.log(`[server] /v1/extract-documents quota denied`);
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies ExtractDocumentsResponse);
      }

      const documents = await extractDocuments(parsed);
      await chargeTokens(auth, estimarTokensDocumentos(parsed.files.length));
      console.log(`[server] /v1/extract-documents ok documents=${documents.length}`);
      const payload: ExtractDocumentsResponse = { ok: true, documents };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[server] /v1/extract-documents error`, message);
      const payload: ExtractDocumentsResponse = { ok: false, error: message };
      return sendJson(res, 400, payload);
    }
  }

  sendJson(res, 404, { ok: false, error: "Rota não encontrada." });
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((err) => {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

server.listen(PORT, HOST, () => {
  const corePath = resolveLunaCorePath();
  const ready = isCoreBuilt(corePath);
  const fb = isFirebaseAdminConfigured();
  console.log("");
  console.log("  Luna Mobile API");
  console.log(`  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Core: ${corePath}`);
  console.log(`  Core compilada: ${ready ? "sim" : "NÃO — npm run build na raiz"}`);
  console.log(`  Firebase Admin: ${fb ? "sim" : "não (sem persistência cloud)"}`);
  console.log(`  LUNA_STORE: ${deveUsarPersistenciaFirestore() ? "firestore" : "sqlite"}`);
  console.log("");
  console.log("  POST /v1/chat        { message, sessionId?, userMessageId?, lunaMessageId? }");
  console.log("  POST /v1/chat/stream SSE — status | reasoning | content | done | error");
  console.log("  POST /v1/billing/checkout | sync | trial/sync | credit-pack");
  console.log("  POST /v1/billing/webhook/asaas");
  console.log("  POST /v1/transcribe { audioBase64, mimeType?, language? }");
  console.log("  POST /v1/vision            { images[], userPrompt? }");
  console.log("  POST /v1/extract-documents { files[] }");
  console.log("  GET  /health");
  console.log("");
});
