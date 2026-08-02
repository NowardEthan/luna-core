import { randomUUID } from "node:crypto";

import { getAdminBucket, urlDownloadStorage } from "./firebaseAdmin.js";

/**
 * A mão que DESENHA — a Luna gera uma imagem a partir de um prompt.
 *
 * Ao contrário da visão (`descreverImagemOpenRouter`), que manda imagem e recebe texto, aqui é o
 * inverso: manda texto e recebe imagem. E não é a via `modalities` do /chat/completions (essa é a
 * do Gemini/nano-banana) — o Riverflow usa o endpoint DEDICADO `/api/v1/images` da OpenRouter.
 *
 * O byte não trafega pelo chat: a imagem volta em base64, sobe pro Firebase Storage, e o que segue
 * pro app é só a URL (leve, e o chat pode persistir sem carregar megabytes por mensagem).
 */

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const MODELO_PADRAO = "sourceful/riverflow-v2.5-fast";

export type ImagemGerada = {
  id: string;
  url: string;
  prompt: string;
  /** Custo em dólares reportado pela OpenRouter (pra telemetria/log). */
  custoUsd?: number;
};

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function modelo(): string {
  return process.env.OPENROUTER_IMAGE_MODEL?.trim() || MODELO_PADRAO;
}

type RespostaImagens = {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
    image_url?: { url?: string };
    url?: string;
  }>;
  usage?: { cost?: number };
  error?: { message?: string };
};

/** Extrai os bytes + o mime da primeira imagem da resposta (aceita b64_json ou data-url). */
function extrairBytes(item: NonNullable<RespostaImagens["data"]>[number]): {
  buffer: Buffer;
  mime: string;
} | null {
  if (item.b64_json) {
    return {
      buffer: Buffer.from(item.b64_json, "base64"),
      mime: item.media_type?.trim() || "image/webp",
    };
  }
  const dataUrl = item.image_url?.url ?? item.url ?? "";
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (m) return { buffer: Buffer.from(m[2]!, "base64"), mime: m[1]! };
  return null;
}

export async function gerarImagemLuna(uid: string, prompt: string): Promise<ImagemGerada> {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — geração de imagem indisponível.");
  if (!uid) throw new Error("uid ausente — não sei de quem é a imagem.");
  const texto = prompt.trim();
  if (!texto) throw new Error("Prompt vazio — descreve a imagem a desenhar.");

  const bucket = getAdminBucket();
  if (!bucket) throw new Error("Firebase Storage indisponível (sem credenciais de Admin).");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const res = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: modelo(), prompt: texto, n: 1 }),
  });

  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 300);
    throw new Error(`Geração de imagem falhou (${res.status}): ${corpo}`);
  }

  const json = (await res.json()) as RespostaImagens;
  const item = json.data?.[0];
  if (!item) throw new Error(json.error?.message || "O modelo não devolveu imagem.");

  const bytes = extrairBytes(item);
  if (!bytes) throw new Error("A resposta veio sem bytes de imagem legíveis.");

  // Sobe pro Storage com um token de download — a mesma URL estável que o SDK do cliente produz.
  const id = randomUUID();
  const ext = bytes.mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "webp";
  const caminho = `users/${uid}/imagens/${id}.${ext}`;
  const token = randomUUID();
  const arquivo = bucket.file(caminho);
  await arquivo.save(bytes.buffer, {
    resumable: false,
    contentType: bytes.mime,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  return {
    id,
    url: urlDownloadStorage(caminho, token),
    prompt: texto,
    custoUsd: json.usage?.cost,
  };
}
