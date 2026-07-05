import { z } from "zod";

export const TranscribeRequestSchema = z.object({
  audioBase64: z.string().min(16).max(25_000_000),
  mimeType: z.string().max(64).optional().default("audio/m4a"),
  language: z.string().max(8).optional().default("pt"),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

function resolveSttConfig(): { apiKey: string; apiUrl: string; model: string } | null {
  const apiKey =
    process.env.LUNA_STT_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.LUNA_API_KEY?.trim() ||
    "";

  if (!apiKey) return null;

  const lunaBase = process.env.LUNA_API_BASE?.trim() ?? "";
  const usesGroq =
    lunaBase.includes("groq.com") || apiKey.startsWith("gsk_") || Boolean(process.env.GROQ_API_KEY?.trim());

  const apiUrl =
    process.env.LUNA_STT_API_URL?.trim() ||
    (usesGroq
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions");

  const model =
    process.env.LUNA_STT_MODEL?.trim() ||
    (apiUrl.includes("groq.com") ? "whisper-large-v3-turbo" : "whisper-1");

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
    throw new Error("STT não configurado no servidor (LUNA_API_KEY ou LUNA_STT_API_KEY).");
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

  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
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
