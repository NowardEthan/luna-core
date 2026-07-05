import { z } from "zod";

export const VisionRequestSchema = z.object({
  images: z
    .array(
      z.object({
        imageBase64: z.string().min(32).max(20_000_000),
        mimeType: z.string().max(64).optional().default("image/jpeg"),
        name: z.string().max(256).optional(),
      }),
    )
    .min(1)
    .max(5),
  /** Texto do utilizador — dá contexto à descrição visual. */
  userPrompt: z.string().max(800).optional(),
});

export type VisionRequest = z.infer<typeof VisionRequestSchema>;

export type VisionDescription = {
  name?: string;
  description: string;
};

const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const DEFAULT_VISION_PROMPT =
  "Descreva esta imagem em português do Brasil de forma factual e detalhada. " +
  "Inclua todo o texto legível (OCR), elementos visuais, cores, layout e contexto. " +
  "Responda só com a descrição, sem preâmbulo nem markdown.";

function resolveVisionConfig(): { apiKey: string; apiUrl: string; model: string; prompt: string } | null {
  const apiKey =
    process.env.LUNA_VISION_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.LUNA_API_KEY?.trim() ||
    "";

  if (!apiKey) return null;

  const lunaBase = process.env.LUNA_API_BASE?.trim() ?? "";
  const usesGroq =
    lunaBase.includes("groq.com") || apiKey.startsWith("gsk_") || Boolean(process.env.GROQ_API_KEY?.trim());

  const apiUrl =
    process.env.LUNA_VISION_API_URL?.trim() ||
    (usesGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");

  const model =
    process.env.LUNA_VISION_MODEL?.trim() ||
    (usesGroq ? DEFAULT_VISION_MODEL : "gpt-4o-mini");

  const prompt = process.env.LUNA_VISION_PROMPT?.trim() || DEFAULT_VISION_PROMPT;

  return { apiKey, apiUrl, model, prompt };
}

export function isVisionConfigured(): boolean {
  return resolveVisionConfig() !== null;
}

async function describeOneImage(
  cfg: NonNullable<ReturnType<typeof resolveVisionConfig>>,
  image: VisionRequest["images"][number],
  userPrompt?: string,
): Promise<string> {
  const buffer = Buffer.from(image.imageBase64, "base64");
  if (buffer.length < 64) {
    throw new Error("Imagem pequena demais para analisar.");
  }
  if (buffer.length > 18 * 1024 * 1024) {
    throw new Error("Imagem grande demais (máx. ~18 MB).");
  }

  const mime = image.mimeType || "image/jpeg";
  const dataUrl = `data:${mime};base64,${image.imageBase64}`;

  let instruction = cfg.prompt;
  if (userPrompt?.trim()) {
    instruction += `\n\nMensagem do utilizador sobre esta imagem: ${userPrompt.trim()}`;
  }
  if (image.name?.trim()) {
    instruction += `\n\nNome do arquivo: ${image.name.trim()}`;
  }

  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 240);
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      if (json.error?.message) detail = json.error.message;
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new Error("Chave de visão inválida no servidor.");
    throw new Error(`Análise visual falhou (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("O modelo de visão não retornou descrição.");
  return text;
}

/** Descreve imagens via modelo multimodal (Groq Llama 4 Scout). */
export async function describeImages(input: VisionRequest): Promise<VisionDescription[]> {
  const cfg = resolveVisionConfig();
  if (!cfg) {
    throw new Error("Visão não configurada no servidor (LUNA_API_KEY ou LUNA_VISION_API_KEY).");
  }

  const results: VisionDescription[] = [];
  for (const image of input.images) {
    const description = await describeOneImage(cfg, image, input.userPrompt);
    results.push({ name: image.name, description });
  }
  return results;
}
