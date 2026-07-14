import type { RequisicaoCompletacao } from "./tipos.js";
import { aplicarCorpoRaciocinio } from "./raciocinioApi.js";
import { serializarCorpoLlm } from "./cerebrasPayload.js";

export type ChunkStreamLlm =
  | { tipo: "content"; delta: string }
  | { tipo: "reasoning"; delta: string };

export type RespostaStreamCompletacao = {
  conteudo: string;
  raciocinio?: string;
  modelo: string;
  latencia_ms: number;
};

export type OpcoesStreamOpenAi = {
  apiKey: string;
  baseUrl: string;
  maxTentativas?: number;
};

function buildLlmHeaders(apiKey: string, baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://github.com/luna-orbit";
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE?.trim() || "Luna Orbit Mobile";
  }
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Processa linhas SSE acumuladas e emite chunks de conteúdo/raciocínio. */
export function processarLinhasSse(
  linhas: string[],
  onChunk: (chunk: ChunkStreamLlm) => void,
): void {
  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    let json: {
      model?: string;
      choices?: Array<{
        delta?: { content?: string | null; reasoning?: string | null };
      }>;
    };
    try {
      json = JSON.parse(payload) as typeof json;
    } catch {
      continue;
    }

    const delta = json.choices?.[0]?.delta;
    if (!delta) continue;

    if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
      onChunk({ tipo: "reasoning", delta: delta.reasoning });
    }
    if (typeof delta.content === "string" && delta.content.length > 0) {
      onChunk({ tipo: "content", delta: delta.content });
    }
  }
}

/** Lê corpo SSE de chat/completions e invoca onChunk por delta. */
export async function lerCorpoSseStream(
  body: ReadableStream<Uint8Array> | null,
  onChunk: (chunk: ChunkStreamLlm) => void,
): Promise<void> {
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    processarLinhasSse(linhas, onChunk);
  }

  if (buffer.trim()) {
    processarLinhasSse([buffer], onChunk);
  }
}

/**
 * Chat completions com stream=true — Cerebras/OpenAI-compatível.
 * Acumula texto final e raciocínio separados.
 */
export async function completarStreamOpenAi(
  opcoes: OpcoesStreamOpenAi,
  requisicao: RequisicaoCompletacao,
  onChunk?: (chunk: ChunkStreamLlm) => void,
): Promise<RespostaStreamCompletacao> {
  const url = opcoes.baseUrl.replace(/\/$/, "");
  const maxTentativas = opcoes.maxTentativas ?? 5;
  const inicio = Date.now();

  const corpo: Record<string, unknown> = {
    model: requisicao.modelo,
    messages: requisicao.mensagens.map((m) => ({
      role: m.papel,
      content: m.conteudo,
    })),
    temperature: requisicao.temperatura,
    ...(requisicao.maxTokens ? { max_tokens: requisicao.maxTokens } : {}),
    stream: true,
  };

  const raciocinioAtivo = requisicao.raciocinioAtivo !== false;
  aplicarCorpoRaciocinio(corpo, requisicao.modelo, url, raciocinioAtivo, false, requisicao.raciocinioEffort);

  const { body, headers: bodyHeaders } = serializarCorpoLlm(corpo, url);
  const headers = { ...buildLlmHeaders(opcoes.apiKey, url), ...bodyHeaders };

  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    let conteudo = "";
    let raciocinio = "";
    let modelo = requisicao.modelo;

    const resposta = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers,
      body,
    });

    if (!resposta.ok) {
      ultimoErro = await resposta.text();
      const retryavel = resposta.status === 429 || resposta.status === 503;
      if (!retryavel || tentativa === maxTentativas) {
        throw new Error(`LLM stream ${resposta.status}: ${ultimoErro.slice(0, 280)}`);
      }
      await sleep(tentativa * 5000);
      continue;
    }

    await lerCorpoSseStream(resposta.body, (chunk) => {
      if (chunk.tipo === "reasoning") {
        raciocinio += chunk.delta;
      } else {
        conteudo += chunk.delta;
      }
      onChunk?.(chunk);
    });

    return {
      conteudo: conteudo.trim(),
      raciocinio: raciocinio.trim() || undefined,
      modelo,
      latencia_ms: Date.now() - inicio,
    };
  }

  throw new Error(`LLM stream falhou após ${maxTentativas} tentativas: ${ultimoErro}`);
}

export function lunaStreamEnabled(): boolean {
  const raw = process.env.LUNA_STREAM_ENABLED?.trim();
  return raw !== "0" && raw !== "false";
}

export function providerSupportsStream(baseUrl: string): boolean {
  return /cerebras\.ai|openrouter\.ai/i.test(baseUrl) && lunaStreamEnabled();
}
