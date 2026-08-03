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

/** Aspectos que o OpenRouter/Seedream aceitam de forma estável. */
export type AspectRatioOpenRouter =
  | "1:1"
  | "16:9"
  | "9:16"
  | "21:9"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3";

const ASPECTOS_VALIDOS = new Set<string>([
  "1:1",
  "16:9",
  "9:16",
  "21:9",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
]);

/**
 * Normaliza um valor explícito (`9:16`, `aspect_ratio=9:16`) ou devolve undefined.
 * Preferir SEMPRE o param da ferramenta a adivinhar pelo texto.
 */
export function normalizarAspectRatio(
  valor?: string | null,
): AspectRatioOpenRouter | undefined {
  if (!valor) return undefined;
  const limpo = valor.trim().replace(/\s+/g, "");
  const m = limpo.match(/(\d+)\s*:\s*(\d+)/);
  if (m) {
    const cand = `${m[1]}:${m[2]}`;
    if (ASPECTOS_VALIDOS.has(cand)) return cand as AspectRatioOpenRouter;
  }
  if (ASPECTOS_VALIDOS.has(limpo)) return limpo as AspectRatioOpenRouter;
  return extrairAspectoDeTexto(valor);
}

/**
 * Extrai aspecto de texto livre. Ratios LITERAIS (`9:16`) primeiro — palavras vagas
 * (`horizontal`/`vertical`) depois. Assim «não horizontal, usa 9:16» não vira 16:9.
 */
export function extrairAspectoDeTexto(
  ...textos: Array<string | undefined | null>
): AspectRatioOpenRouter | undefined {
  const prompt = textos.filter((t) => t && t.trim()).join("\n");
  if (!prompt) return undefined;

  if (/\b21\s*:\s*9\b/i.test(prompt)) return "21:9";
  if (/\b16\s*:\s*9\b/i.test(prompt)) return "16:9";
  if (/\b9\s*:\s*16\b/i.test(prompt)) return "9:16";
  if (/\b4\s*:\s*3\b/i.test(prompt)) return "4:3";
  if (/\b3\s*:\s*4\b/i.test(prompt)) return "3:4";
  if (/\b3\s*:\s*2\b/i.test(prompt)) return "3:2";
  if (/\b2\s*:\s*3\b/i.test(prompt)) return "2:3";
  if (/\b1\s*:\s*1\b/i.test(prompt)) return "1:1";

  if (/\b(ultrawide|cinema)\b/i.test(prompt)) return "21:9";
  if (/\b(widescreen)\b/i.test(prompt)) return "16:9";
  if (/\b(vertical|retrato|portrait|stories?)\b/i.test(prompt)) return "9:16";
  if (/\b(horizontal|paisagem|landscape)\b/i.test(prompt)) return "16:9";
  if (/\bquadrad[ao]\b/i.test(prompt)) return "1:1";
  return undefined;
}

function dimensoesPollinations(aspect?: AspectRatioOpenRouter): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "21:9":
      return { width: 1344, height: 576 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "3:2":
      return { width: 1152, height: 768 };
    case "2:3":
      return { width: 768, height: 1152 };
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Em edição com mudança de proporção, o modelo tende a CORTAR o sujeito.
 * Prefixa pedindo outpaint: expandir o canvas, não zoom/crop.
 */
function reforcarOutpaint(
  instrucao: string,
  aspect: AspectRatioOpenRouter | undefined,
): string {
  if (!aspect) return instrucao;
  return (
    `Change the canvas to aspect ratio ${aspect}. Expand / outpaint the scene to fill the new frame. ` +
    `Keep the FULL subject visible from head to toe (or full object) — do NOT crop, cut off, zoom in, or trim edges. ` +
    `Grow background and scenery to fill empty space. Preserve character identity, style and mood. ` +
    `Request: ${instrucao}`
  );
}

/** Fallback gratuito via Pollinations.ai (FLUX) quando o OpenRouter estiver sem saldo ou falhar. */
async function pedirImagemPollinations(
  prompt: string,
  aspect?: AspectRatioOpenRouter,
): Promise<{ buffer: Buffer; mime: string }> {
  const seed = Math.floor(Math.random() * 1000000);
  const { width, height } = dimensoesPollinations(aspect);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pollinations falhou (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return {
    buffer: Buffer.from(arrayBuffer),
    mime: contentType,
  };
}

export type OpcoesGerarImagem = {
  /** Proporção explícita — tem prioridade sobre regex no prompt. */
  aspectRatio?: string;
};

export async function gerarImagemLuna(
  uid: string,
  prompt: string,
  opts?: OpcoesGerarImagem,
): Promise<ImagemGerada> {
  if (!uid) throw new Error("uid ausente — não sei de quem é a imagem.");
  const texto = prompt.trim();
  if (!texto) throw new Error("Prompt vazio — descreve a imagem a desenhar.");

  let bytes: { buffer: Buffer; mime: string; custoUsd?: number };
  const key = apiKey();
  const aspect_ratio =
    normalizarAspectRatio(opts?.aspectRatio) ?? extrairAspectoDeTexto(texto);
  if (key) {
    try {
      bytes = await pedirImagem(key, {
        model: modelo(),
        prompt: texto,
        n: 1,
        ...(aspect_ratio ? { aspect_ratio } : {}),
      });
    } catch (err) {
      console.warn("[Imagem] OpenRouter falhou, gerando via fallback Pollinations:", err);
      bytes = await pedirImagemPollinations(texto, aspect_ratio);
    }
  } else {
    bytes = await pedirImagemPollinations(texto, aspect_ratio);
  }

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
export type OpcoesEditarImagem = {
  aspectRatio?: string;
};

export async function editarImagemLuna(
  uid: string,
  instrucao: string,
  baseUrl: string,
  referenciaUrls: string[] = [],
  opts?: OpcoesEditarImagem,
): Promise<ImagemGerada> {
  if (!uid) throw new Error("uid ausente — não sei de quem é a imagem.");
  const texto = instrucao.trim();
  if (!texto) throw new Error("Sem instrução — descreve a mudança a fazer.");
  if (!baseUrl) throw new Error("Sem imagem base — não há o que editar.");

  const extras = referenciaUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  const promptBase =
    extras.length > 0
      ? "Image 1 is the BASE — keep the same subject/character/composition. " +
        "Image 2+ are STYLE references — apply their palette, stroke, lighting and mood. " +
        `Request: ${texto}`
      : texto;

  const aspect_ratio =
    normalizarAspectRatio(opts?.aspectRatio) ?? extrairAspectoDeTexto(texto);
  const prompt = reforcarOutpaint(promptBase, aspect_ratio);

  const input_references = [
    { type: "image_url", image_url: { url: baseUrl } },
    ...extras.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  let bytes: { buffer: Buffer; mime: string; custoUsd?: number };
  const key = apiKey();
  if (key) {
    try {
      bytes = await pedirImagem(key, {
        model: modeloEdicao(),
        prompt,
        input_references,
        n: 1,
        ...(aspect_ratio ? { aspect_ratio } : {}),
      });
    } catch (err) {
      console.warn("[Imagem] OpenRouter edição falhou, tentando fallback Pollinations:", err);
      bytes = await pedirImagemPollinations(
        `${texto} (base picture provided, style and changes applied)`,
        aspect_ratio,
      );
    }
  } else {
    bytes = await pedirImagemPollinations(
      `${texto} (base picture provided, style and changes applied)`,
      aspect_ratio,
    );
  }

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
