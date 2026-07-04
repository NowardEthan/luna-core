import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { executarChatMobile } from "./loadCore.js";
import { isCoreBuilt, resolveLunaCorePath } from "./resolveCorePath.js";
import { ChatRequestSchema, type ChatResponse, type HealthResponse } from "./types.js";

const HOST = process.env.LUNA_MOBILE_API_HOST?.trim() || "0.0.0.0";
/** Railway injecta PORT; local usa LUNA_MOBILE_API_PORT ou 7742. */
const PORT = Number(process.env.PORT ?? process.env.LUNA_MOBILE_API_PORT ?? 7742);

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    const corePath = resolveLunaCorePath();
    const payload: HealthResponse = {
      ok: true,
      service: "luna-mobile-api",
      corePath,
      coreReady: isCoreBuilt(corePath),
    };
    return sendJson(res, payload.coreReady ? 200 : 503, payload);
  }

  if (method === "POST" && url.pathname === "/v1/chat") {
    try {
      const body = await readJson(req);
      const parsed = ChatRequestSchema.parse(body);
      const result = await executarChatMobile(parsed.message, parsed.sessionId);
      const payload: ChatResponse = {
        ok: true,
        text: result.text,
        sessionId: result.sessionId,
        turnCount: result.turnCount,
      };
      return sendJson(res, 200, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const payload: ChatResponse = { ok: false, error: message };
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
  console.log("");
  console.log("  Luna Mobile API");
  console.log(`  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Core: ${corePath}`);
  console.log(`  Core compilada: ${ready ? "sim" : "NÃO — npm run build na raiz"}`);
  console.log("");
  console.log("  POST /v1/chat  { message, sessionId? }");
  console.log("  GET  /health");
  console.log("");
});
