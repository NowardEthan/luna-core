import type { ChunkStreamLlm } from "./completarStream.js";

export type { ChunkStreamLlm };

/** Delta de tool_call em stream (OpenAI: acumular por `index`). */
export type ChunkStreamAgente =
  | ChunkStreamLlm
  | {
      tipo: "tool_call_delta";
      index: number;
      id?: string;
      nome?: string;
      argumentosDelta?: string;
    }
  | { tipo: "modelo"; modelo: string };

/**
 * Processa linhas SSE de chat/completions com tools (content + reasoning + tool_calls).
 */
export function processarLinhasSseAgente(
  linhas: string[],
  onChunk: (chunk: ChunkStreamAgente) => void,
): void {
  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    let json: {
      model?: string;
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    try {
      json = JSON.parse(payload) as typeof json;
    } catch {
      continue;
    }

    if (typeof json.model === "string" && json.model.length > 0) {
      onChunk({ tipo: "modelo", modelo: json.model });
    }

    const delta = json.choices?.[0]?.delta;
    if (!delta) continue;

    const reasoning =
      (typeof delta.reasoning === "string" && delta.reasoning) ||
      (typeof delta.reasoning_content === "string" && delta.reasoning_content) ||
      "";
    if (reasoning.length > 0) {
      onChunk({ tipo: "reasoning", delta: reasoning });
    }
    if (typeof delta.content === "string" && delta.content.length > 0) {
      onChunk({ tipo: "content", delta: delta.content });
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = typeof tc.index === "number" ? tc.index : 0;
        onChunk({
          tipo: "tool_call_delta",
          index,
          id: typeof tc.id === "string" ? tc.id : undefined,
          nome: typeof tc.function?.name === "string" ? tc.function.name : undefined,
          argumentosDelta:
            typeof tc.function?.arguments === "string" ? tc.function.arguments : undefined,
        });
      }
    }
  }
}

export async function lerCorpoSseStreamAgente(
  body: ReadableStream<Uint8Array> | null,
  onChunk: (chunk: ChunkStreamAgente) => void,
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
    processarLinhasSseAgente(linhas, onChunk);
  }

  if (buffer.trim()) {
    processarLinhasSseAgente([buffer], onChunk);
  }
}
