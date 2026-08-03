import { z } from "zod";

export const TranscribeRequestSchema = z.object({
  audioBase64: z.string().min(16).max(25_000_000),
  mimeType: z.string().max(64).optional().default("audio/m4a"),
  language: z.string().max(8).optional().default("pt"),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

/**
 * STT via OpenRouter, só OpenRouter — mesma chave (`OPENROUTER_API_KEY`) do chat e
 * da visão. O OpenRouter tem um endpoint de transcrição OpenAI-compatível
 * (`/api/v1/audio/transcriptions`) que aceita o mesmo multipart que já mandamos.
 *
 * Antes havia um fallback Groq/OpenAI que escolhia provedor pela chave/base — foi
 * daí que veio o «Chave STT inválida»: sem a chave da Groq, ele caía na chave do
 * chat (OpenRouter) e batia no endpoint da OpenAI, que recusava (401). Fim do
 * fallback: uma fonte só, sem tropeço.
 */
function resolveSttConfig(): { apiKey: string; apiUrl: string; model: string } | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) return null;

  const apiUrl =
    process.env.LUNA_STT_API_URL?.trim() || "https://openrouter.ai/api/v1/audio/transcriptions";

  // Slug confirmado no OpenRouter; sobrescreve por env se quiser um mais novo/barato.
  const model = process.env.LUNA_STT_MODEL?.trim() || "openai/whisper-1";

  return { apiKey, apiUrl, model };
}

export function isSttConfigured(): boolean {
  return resolveSttConfig() !== null;
}

function extensionForMime(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("3gp")) return "3gp";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("caf")) return "caf";
  return "m4a";
}

/** Transcreve áudio via Whisper (Groq/OpenAI) — chave só no servidor. */
export async function transcribeAudio(input: TranscribeRequest): Promise<string> {
  const cfg = resolveSttConfig();
  if (!cfg) {
    throw new Error("STT não configurado no servidor (OPENROUTER_API_KEY ausente).");
  }

  const buffer = Buffer.from(input.audioBase64, "base64");
  if (buffer.length < 256) {
    throw new Error("Áudio curto demais para transcrever.");
  }
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Áudio grande demais (máx. ~20 MB).");
  }

  const ext = extensionForMime(input.mimeType);
  const blob = new Blob([buffer], { type: input.mimeType });
  const form = new FormData();
  form.append("file", blob, `gravacao.${ext}`);
  form.append("model", cfg.model);
  form.append("language", input.language);
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append(
    "prompt",
    process.env.LUNA_STT_PROMPT?.trim() || "Mensagem de voz em português do Brasil.",
  );

  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
  // Atribuição opcional do OpenRouter (mesmos envs da visão/leitor).
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 200);
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      if (json.error?.message) detail = json.error.message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new Error("Chave STT inválida no servidor.");
    throw new Error(`Transcrição falhou (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error("Não detectamos fala neste áudio.");
  return text;
}
