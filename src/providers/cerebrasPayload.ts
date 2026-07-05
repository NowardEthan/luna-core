import { gzipSync } from "node:zlib";

const DEFAULT_GZIP_MIN_BYTES = 8192;

export function isCerebrasBaseUrl(baseUrl: string): boolean {
  return /cerebras\.ai/i.test(baseUrl);
}

export function cerebrasGzipMinBytes(): number {
  const raw = process.env.CEREBRAS_GZIP_MIN_BYTES?.trim();
  if (!raw) return DEFAULT_GZIP_MIN_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GZIP_MIN_BYTES;
}

export type CorpoSerializado = {
  body: string | Buffer;
  headers: Record<string, string>;
};

/** Serializa corpo JSON — gzip condicional para Cerebras (payloads grandes). */
export function serializarCorpoLlm(
  corpo: Record<string, unknown>,
  baseUrl: string,
): CorpoSerializado {
  const json = JSON.stringify(corpo);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!isCerebrasBaseUrl(baseUrl) || json.length < cerebrasGzipMinBytes()) {
    return { body: json, headers };
  }

  const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 5 });
  headers["Content-Encoding"] = "gzip";
  return { body: compressed, headers };
}

export function cerebrasReasoningEffort(): "low" | "medium" | "high" | "none" {
  const raw = process.env.CEREBRAS_REASONING_EFFORT?.trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "none") {
    return raw;
  }
  return "medium";
}
