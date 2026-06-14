/** Extrai JSON de respostas LLM (markdown, texto livre ou json_object). */
export function extrairJsonResposta(texto: string): unknown {
  const bloco = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (bloco) {
    return JSON.parse(bloco[1]!.trim()) as unknown;
  }

  const trimmed = texto.trim();
  if (!trimmed) {
    throw new Error("Resposta LLM vazia — JSON esperado.");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    /* tenta recortar objeto */
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }

  throw new Error("JSON não encontrado na resposta do modelo.");
}

/** LM Studio / Ollama local — response_format json_object costuma falhar. */
export function isProvedorLocal(baseUrl: string): boolean {
  try {
    const normalizado = baseUrl.includes("://")
      ? baseUrl
      : `http://${baseUrl}`;
    const host = new URL(normalizado).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(baseUrl);
  }
}

/** Groq/OpenAI usam json_object; local usa prompt + parser tolerante. */
export function usarJsonEstritoOpenAi(baseUrl: string): boolean {
  const env = process.env.LUNA_JSON_ESTRITO?.trim().toLowerCase();
  if (env === "1" || env === "true" || env === "sim") return true;
  if (env === "0" || env === "false" || env === "nao" || env === "não") {
    return false;
  }
  return !isProvedorLocal(baseUrl);
}

export function erroPermiteRetrySemJsonEstrito(erro: unknown): boolean {
  const msg = (erro instanceof Error ? erro.message : String(erro)).toLowerCase();
  return (
    /\b400\b/.test(msg) ||
    /\b422\b/.test(msg) ||
    /response_format/.test(msg) ||
    /json_object/.test(msg) ||
    /unsupported/.test(msg)
  );
}
