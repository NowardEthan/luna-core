import type { PersonalLlmProviderInput } from "./loadCore.js";

export type PersonalProviderTestResult =
  | {
      ok: true;
      provider: "personal";
      model: string;
      baseUrl: string;
      latencyMs: number;
      sample: string;
    }
  | {
      ok: false;
      error: string;
      baseUrl?: string;
      status?: number;
    };

function isAnthropicNativeMessagesUrl(url: URL): boolean {
  return /anthropic\.com$/i.test(url.hostname) && /\/v1\/messages\/?$/i.test(url.pathname);
}

export function normalizePersonalProviderBaseUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname
    .replace(/\/+$/g, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/responses$/i, "");
  return parsed.toString().replace(/\/$/, "");
}

function personalProviderHeaders(apiKey: string, baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://github.com/luna-orbit";
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE?.trim() || "Luna Orbit Mobile";
  }
  return headers;
}

function errorDetail(raw: string): string {
  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string") return json.error;
    if (typeof json.error?.message === "string") return json.error.message;
    if (typeof json.message === "string") return json.message;
  } catch {
    /* corpo nao JSON */
  }
  return raw;
}

function friendlyProviderError(status: number, body: string, baseUrl: string): string {
  const detail = errorDetail(body).replace(/\s+/g, " ").trim().slice(0, 220);
  if (status === 401 || status === 403) {
    return "API key recusada pelo provedor. Confira a chave e se ela tem acesso ao modelo.";
  }
  if (status === 404) {
    return `Endpoint nao encontrado. A Base URL precisa ser OpenAI-compatible, normalmente terminando em /v1. Testado: ${baseUrl}/chat/completions.`;
  }
  if (status === 400 && /messages|anthropic|chat\/completions/i.test(detail)) {
    return "Esse provedor parece usar Anthropic Messages API nativa. A Luna espera um endpoint OpenAI-compatible (/v1/chat/completions).";
  }
  if (status === 429) {
    return "O provedor respondeu rate limit. Aguarde alguns segundos ou confira o limite do plano.";
  }
  return detail ? `Provedor respondeu HTTP ${status}: ${detail}` : `Provedor respondeu HTTP ${status}.`;
}

export async function testPersonalProvider(
  provider: PersonalLlmProviderInput,
): Promise<PersonalProviderTestResult> {
  let baseUrl: string;
  try {
    baseUrl = normalizePersonalProviderBaseUrl(provider.baseUrl);
  } catch {
    return {
      ok: false,
      error: "Base URL invalida. Use uma URL completa, ex.: https://api.exemplo.com/v1.",
    };
  }

  const parsed = new URL(baseUrl);
  if (isAnthropicNativeMessagesUrl(parsed)) {
    return {
      ok: false,
      baseUrl,
      error: "Essa URL e da Anthropic Messages API nativa. Use uma Base URL OpenAI-compatible ou um gateway que exponha /v1/chat/completions.",
    };
  }

  const model = provider.model.trim();
  const apiKey = provider.apiKey.trim();
  if (!apiKey || !model) {
    return { ok: false, baseUrl, error: "Informe API key e modelo antes de testar." };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: personalProviderHeaders(apiKey, baseUrl),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda exatamente: ok" }],
        temperature: 0,
        max_tokens: 12,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        baseUrl,
        status: response.status,
        error: friendlyProviderError(response.status, raw, baseUrl),
      };
    }

    const json = JSON.parse(raw) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const sample = json.choices?.[0]?.message?.content?.trim();
    if (!sample) {
      return {
        ok: false,
        baseUrl,
        error: "O provedor respondeu, mas nao devolveu texto em choices[0].message.content.",
      };
    }

    return {
      ok: true,
      provider: "personal",
      model: json.model ?? model,
      baseUrl,
      latencyMs: Date.now() - started,
      sample,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      baseUrl,
      error: aborted
        ? "O teste demorou mais de 25s. Confira a Base URL ou tente de novo."
        : `Falha de rede com o provedor: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
