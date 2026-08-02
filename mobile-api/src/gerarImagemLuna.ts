import { randomUUID } from "node:crypto";

import { getAdminBucket, urlDownloadStorage } from "./firebaseAdmin.js";

/**
 * A mão que DESENHA — a Luna gera (ou EDITA) uma imagem a partir de um prompt.
 *
 * Ao contrário da visão (`descreverImagemOpenRouter`), que manda imagem e recebe texto, aqui é o
 * inverso: manda texto e recebe imagem. E não é a via `modalities` do /chat/completions — a
 * OpenRouter expõe um endpoint DEDICADO `/api/v1/images`.
 *
 * Dois modos, MESMO modelo por padrão — o Seedream 4.5 (ByteDance) é text-to-image E
 * image-to-image, com boa consistência na edição, anime e texto pequeno (~US$ 0,04/img):
 *  - GERAR (do zero): texto → imagem nova.
 *  - EDITAR (preservando): a imagem anterior vai em `input_references` (URL do Storage) e o modelo
 *    mexe no que o prompt pede — «adiciona um sachê» deve virar a MESMA xícara com o sachê.
 * Prefira URL (não base64) nas refs: payload leve e estável.
 *
 * Override: `OPENROUTER_IMAGE_MODEL` / `OPENROUTER_IMAGE_EDIT_MODEL` (ex. voltar pro Riverflow Fast).
 *
 * O byte não trafega pelo chat: a imagem volta em base64, sobe pro Firebase Storage, e o que segue
 * pro app é só a URL (leve, e o chat pode persistir sem carregar megabytes por mensagem).
 */

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const MODELO_PADRAO = "bytedance-seed/seedream-4.5";

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

/** O modelo de edição; por padrão o MESMO da geração (Seedream edita). Overridável se um dia quiser. */
function modeloEdicao(): string {
  return process.env.OPENROUTER_IMAGE_EDIT_MODEL?.trim() || modelo();
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

function cabecalhos(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;
  return headers;
}

/** Faz o POST em /api/v1/images, valida a resposta e devolve os bytes + custo. */
async function pedirImagem(
  key: string,
  corpo: Record<string, unknown>,
): Promise<{ buffer: Buffer; mime: string; custoUsd?: number }> {
  const res = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: cabecalhos(key),
    body: JSON.stringify(corpo),
  });

  if (!res.ok) {
    const texto = (await res.text()).slice(0, 300);
    throw new Error(`Geração de imagem falhou (${res.status}): ${texto}`);
  }

  const json = (await res.json()) as RespostaImagens;
  const item = json.data?.[0];
  if (!item) throw new Error(json.error?.message || "O modelo não devolveu imagem.");

  const bytes = extrairBytes(item);
  if (!bytes) throw new Error("A resposta veio sem bytes de imagem legíveis.");
  return { ...bytes, custoUsd: json.usage?.cost };
}

/** Sobe os bytes pro Storage com token de download e devolve a URL estável. */
async function subirImagem(
  uid: string,
  bytes: { buffer: Buffer; mime: string },
): Promise<{ id: string; url: string }> {
  const bucket = getAdminBucket();
  if (!bucket) throw new Error("Firebase Storage indisponível (sem credenciais de Admin).");
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
  return { id, url: urlDownloadStorage(caminho, token) };
}

export async function gerarImagemLuna(uid: string, prompt: string): Promise<ImagemGerada> {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — geração de imagem indisponível.");
  if (!uid) throw new Error("uid ausente — não sei de quem é a imagem.");
  const texto = prompt.trim();
  if (!texto) throw new Error("Prompt vazio — descreve a imagem a desenhar.");

  const bytes = await pedirImagem(key, { model: modelo(), prompt: texto, n: 1 });
  const { id, url } = await subirImagem(uid, bytes);
  return { id, url, prompt: texto, custoUsd: bytes.custoUsd };
}

/**
 * EDITAR a imagem anterior: manda a URL da imagem base em `input_references` e o modelo preserva o
 * resto, mexendo só no que a `instrucao` pede. `baseUrl` é a URL pública do Storage (token não
 * expira), que o modelo consegue buscar via HTTP.
 *
 * `referenciaUrls` (opcional): anexos DELE — tipicamente estilo/paleta/clima. O Seedream aceita
 * várias referências; a 1ª é a base (arte dela), as seguintes guiam o estilo. Sem isto, «ajusta no
 * estilo da foto que mandei» só ia no texto e ela confabulava.
 */
export async function editarImagemLuna(
  uid: string,
  instrucao: string,
  baseUrl: string,
  referenciaUrls: string[] = [],
): Promise<ImagemGerada> {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — edição de imagem indisponível.");
  if (!uid) throw new Error("uid ausente — não sei de quem é a imagem.");
  const texto = instrucao.trim();
  if (!texto) throw new Error("Instrução vazia — descreve a mudança a fazer.");
  if (!baseUrl) throw new Error("Sem imagem base — não há o que editar.");

  const extras = referenciaUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  const prompt =
    extras.length > 0
      ? "Image 1 is the BASE — keep the same subject/character/composition. " +
        "Image 2+ are STYLE references — apply their palette, stroke, lighting and mood. " +
        `Request: ${texto}`
      : texto;

  const input_references = [
    { type: "image_url", image_url: { url: baseUrl } },
    ...extras.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const bytes = await pedirImagem(key, {
    model: modeloEdicao(),
    prompt,
    input_references,
    n: 1,
  });
  const { id, url } = await subirImagem(uid, bytes);
  return { id, url, prompt: texto, custoUsd: bytes.custoUsd };
}

/**
 * A última imagem que a Luna desenhou/editou NESTA conversa — para o `editar_imagem` saber em cima
 * de qual imagem mexer, sem depender do modelo carregar a URL longa no contexto. Memória de processo
 * (some se o servidor reiniciar): no pior caso, a edição avisa que não há base e ela redesenha.
 */
const ultimaImagemPorChave = new Map<string, { url: string; prompt: string }>();
const LIMITE_CHAVES = 500;

export function registrarUltimaImagem(chave: string, img: { url: string; prompt: string }): void {
  if (!chave) return;
  // Poda simples pra memória não crescer sem teto: ao estourar, esvazia (barato e raro).
  if (ultimaImagemPorChave.size >= LIMITE_CHAVES) ultimaImagemPorChave.clear();
  ultimaImagemPorChave.set(chave, { url: img.url, prompt: img.prompt });
}

export function ultimaImagemDe(chave: string): { url: string; prompt: string } | undefined {
  return chave ? ultimaImagemPorChave.get(chave) : undefined;
}
