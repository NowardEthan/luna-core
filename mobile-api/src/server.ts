import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

import {
  isFirebaseAdminConfigured,
  isFirebaseAuthRequired,
  verifyFirebaseBearer,
} from "./firebaseAdmin.js";
import { persistChatTurn } from "./firestoreChat.js";
import { executarChatMobile, executarChatMobileStream } from "./loadCore.js";
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
  isAnyLlmProviderConfigured,
  isStreamSupported,
  listProviderOptionsForUi,
  normalizeLegacyProviderSelection,
} from "./llmProviders.js";
import { handleBillingRoute, isBillingConfigured } from "./billing/billingRoutes.js";
import { consumeQuota, getUserPlanId, QuotaExceededError } from "./billing/quotaService.js";
import type { PlanId } from "./billing/planMapping.js";
import {
  ChatRequestSchema,
  type ChatResponse,
  type ExtractDocumentsResponse,
  type HealthResponse,
  type TranscribeResponse,
  type VisionResponse,
} from "./types.js";

/**
 * Carrega o .env da luna-core no arranque, para que LUNA_API_KEY (chat + STT)
 * esteja disponível antes do primeiro /v1/chat — senão /v1/transcribe falha
 * quando um áudio é o primeiro pedido. No Railway as Variables já vêm no env.
 */
function bootstrapEnvFromCore(): void {
  if (process.env.LUNA_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()) return;
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

function quotaDeniedPayload(err: QuotaExceededError): { ok: false; error: string; code: "quota_exceeded"; quotaKind: string } {
  return {
    ok: false,
    error: err.message,
    code: "quota_exceeded",
    quotaKind: err.kind,
  };
}

async function enforceQuota(
  auth: Awaited<ReturnType<typeof verifyFirebaseBearer>>,
  kind: Parameters<typeof consumeQuota>[1],
  amount: number,
): Promise<QuotaExceededError | null> {
  if (!auth || auth.isAnonymous) return null;
  try {
    await consumeQuota(auth.uid, kind, amount);
    return null;
  } catch (err) {
    if (err instanceof QuotaExceededError) return err;
    throw err;
  }
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

  if (method === "GET" && url.pathname === "/health") {
    const corePath = resolveLunaCorePath();
    const firebaseConfigured = isFirebaseAdminConfigured();
    const llmProviders = listProviderOptionsForUi().map((o) => ({
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
        planId = await getUserPlanId(auth.uid);
      }

      const llmSelection = normalizeLegacyProviderSelection(
        {
          providerId: parsed.providerId,
          modelKey: parsed.modelKey,
        },
        planId,
      );

      if (auth && !auth.isAnonymous) {
        const denied = await enforceQuota(auth, "messages", 1);
        if (denied) {
          return sendJson(res, 429, quotaDeniedPayload(denied) satisfies ChatResponse);
        }
      }

      const result = await executarChatMobile(
        parsed.message,
        sessionId,
        llmSelection,
        parsed.userDisplayName,
        auth?.uid ?? null,
        planId,
      );

      if (auth) {
        await persistChatTurn({
          uid: auth.uid,
          sessionId: result.sessionId,
          userMessage: parsed.message,
          lunaReply: result.text,
          userMessageId: parsed.userMessageId,
          lunaMessageId: parsed.lunaMessageId,
        });
      }

      const payload: ChatResponse = {
        ok: true,
        text: result.text,
        sessionId: result.sessionId,
        turnCount: result.turnCount,
        providerId: result.provider.providerId,
        modelKey: result.provider.modelKey,
        providerReason: result.providerReason,
        autoMode: result.autoMode,
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
        planId = await getUserPlanId(auth.uid);
      }

      const llmSelection = normalizeLegacyProviderSelection(
        {
          providerId: parsed.providerId,
          modelKey: parsed.modelKey,
        },
        planId,
      );

      if (auth && !auth.isAnonymous) {
        const denied = await enforceQuota(auth, "messages", 1);
        if (denied) {
          return sendJson(res, 429, quotaDeniedPayload(denied) satisfies ChatResponse);
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
        sendSseEvent(res, "error", { error: "Timeout de streaming (120s)." });
        res.end();
      }, 120_000);

      const result = await executarChatMobileStream(
        parsed.message,
        {
          onStatus: (phase) => sendSseEvent(res, "status", { phase }),
          onReasoningDelta: (delta) => sendSseEvent(res, "reasoning", { delta }),
          onContentDelta: (delta) => sendSseEvent(res, "content", { delta }),
        },
        sessionId,
        llmSelection,
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
        });
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
      });
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (sseStarted) {
        sendSseEvent(res, "error", { error: message });
        res.end();
      } else {
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

      const denied = await enforceQuota(auth, "voice", 1);
      if (denied) {
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies TranscribeResponse);
      }

      const text = await transcribeAudio(parsed);
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
      if (isFirebaseAuthRequired() && !auth) {
        const payload: VisionResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = VisionRequestSchema.parse(body);

      const denied = await enforceQuota(auth, "images", parsed.images.length);
      if (denied) {
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies VisionResponse);
      }

      const descriptions = await describeImages(parsed);
      const payload: VisionResponse = { ok: true, descriptions };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const payload: VisionResponse = { ok: false, error: message };
      return sendJson(res, 400, payload);
    }
  }

  if (method === "POST" && url.pathname === "/v1/extract-documents") {
    try {
      const auth = await verifyFirebaseBearer(readAuthHeader(req));
      if (isFirebaseAuthRequired() && !auth) {
        const payload: ExtractDocumentsResponse = {
          ok: false,
          error: "Autenticação Firebase obrigatória.",
        };
        return sendJson(res, 401, payload);
      }

      const body = await readJson(req);
      const parsed = ExtractDocumentsRequestSchema.parse(body);

      const denied = await enforceQuota(auth, "documents", parsed.files.length);
      if (denied) {
        return sendJson(res, 429, quotaDeniedPayload(denied) satisfies ExtractDocumentsResponse);
      }

      const documents = await extractDocuments(parsed);
      const payload: ExtractDocumentsResponse = { ok: true, documents };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
