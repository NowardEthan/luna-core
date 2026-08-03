import { randomUUID } from "node:crypto";

import { escolherModeloEdicao, escolherModeloGeracao } from "./billing/rotearModeloImagem.js";
import { getAdminBucket, urlDownloadStorage } from "./firebaseAdmin.js";

/**
 * A mão que DESENHA — a Luna gera (ou EDITA) uma imagem a partir de um prompt.
 *
 * Ao contrário da visão (`descreverImagemOpenRouter`), que manda imagem e recebe texto, aqui é o
 * inverso: manda texto e recebe imagem. E não é a via `modalities` do /chat/completions — a
 * OpenRouter expõe um endpoint DEDICADO `/api/v1/images`.
 *
 * Roteamento inteligente (ver `billing/rotearModeloImagem.ts`):
 *  - Seedream 4.5 — arte / ilustração / anime (default).
 *  - Riverflow V2.5 Fast — foto / realismo.
 *  - GERAR (do zero): texto → imagem nova.
 *  - EDITAR (preservando): a imagem anterior vai em `input_references` (URL do Storage).
 *
 * Override: `OPENROUTER_IMAGE_MODEL` / `OPENROUTER_IMAGE_EDIT_MODEL` forçam um modelo único.
 *
 * O byte não trafega pelo chat: a imagem volta em base64, sobe pro Firebase Storage, e o que segue
 * pro app é só a URL (leve, e o chat pode persistir sem carregar megabytes por mensagem).
 */

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

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

export type ImagemGerada = {
  id: string;
  url: string;
  prompt: string;
  /** Proporção efetiva enviada ao modelo (se houver). */
  aspectRatio?: AspectRatioOpenRouter;
  /** Custo em dólares reportado pela OpenRouter (pra telemetria/log). */
  custoUsd?: number;
  /** Modelo OpenRouter usado neste desenho. */
  model?: string;
  /** Rota: arte (Seedream) ou realista (Riverflow). */
  estilo?: "arte" | "realista";
};

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
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
 * Pediu mudar formato/proporção de propósito? («refaz em 9:16», «aspect_ratio=…»).
 * Retoques («adiciona um chapéu») NÃO contam — aí preservamos o aspecto atual.
 */
export function mensagemPedeMudancaDeAspecto(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (/\baspect_ratio\s*=\s*\d+\s*:\s*\d+\b/i.test(t)) return true;
  const temRatio = /\b\d+\s*:\s*\d+\b/.test(t);
  const temFormato =
    /\b(formato|propor[cç][aã]o|aspecto|enquadramento|canvas|widescreen|ultrawide|retrato|portrait|paisagem|landscape|quadrad[ao]|story|stories|vertical|horizontal)\b/i.test(
      t,
    );
  if (temRatio && temFormato) return true;
  if (
    /\b(formato|propor[cç][aã]o|aspecto)\b.{0,48}\b(vertical|horizontal|widescreen|ultrawide|retrato|quadrad|story|16\s*:\s*9|9\s*:\s*16)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(refaz\w*|refaça|refaca|muda|mude|troca|troque)\b.{0,40}\b(formato|propor[cç][aã]o|aspecto|para\s+(vertical|horizontal|widescreen|quadrad))\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

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
 * Prefixo de continuidade: edição é i2i, não desenho novo.
 * Vai SEMPRE no começo — sem isto Seedream/Riverflow redesenham OUTRO assunto
 * (ex.: sofá → rosto de mulher quando o pedido é só «faz realista»).
 *
 * Neutro quanto ao tipo de sujeito: objeto, cena, animal ou pessoa — o que está
 * na Image 1 manda; o texto só descreve a mudança.
 */
function prefixoIdentidadeEdicao(
  temEstiloExtra: boolean,
  briefOriginal?: string,
): string {
  const brief = briefOriginal?.trim();
  const ancoraBrief = brief
    ? `The subject of Image 1 is: «${brief.slice(0, 280)}». Keep THAT subject — do not invent a different one. `
    : "";
  return (
    "Image 1 is the BASE to EDIT (image-to-image). This is NOT a new image from scratch. " +
    "Preserve the SAME subject that appears in Image 1 (object, product, scene, animal or person — whatever is there). " +
    "Keep composition, framing and main elements; only apply the requested change (style, detail, lighting, etc.). " +
    "Do NOT replace the subject with a different person, face, character or unrelated scene. " +
    ancoraBrief +
    (temEstiloExtra
      ? "Image 2+ are STYLE references only (palette/stroke/lighting) — never replace the subject from Image 1. "
      : "")
  );
}

/**
 * Mudança de proporção: expandir o quadro sem redesenhar.
 * Orientação = a da BASE (não forçar «em pé» — depende da imagem).
 */
function reforcarAspectoNoPrompt(
  instrucao: string,
  aspect: AspectRatioOpenRouter | undefined,
  modo: "mudar" | "preservar" | "nenhum",
): string {
  if (!aspect || modo === "nenhum") {
    return `${instrucao}`;
  }
  if (modo === "preservar") {
    return (
      `Keep aspect ratio ${aspect} and the same framing as the base. ` +
      `Do not crop, rotate, or reframe. Only: ${instrucao}`
    );
  }
  return (
    `Outpaint/extend THIS base image to aspect ratio ${aspect}. ` +
    `Grow the canvas (add scenery in the empty borders) while keeping the subject IDENTICAL to Image 1. ` +
    `Do NOT rotate 90°. Frame shape changes — content orientation stays as in the base. ` +
    `Do NOT redesign or invent a different character/scene. Only: ${instrucao}`
  );
}

/** Fallback gratuito via Pollinations.ai (FLUX) — só pra GERAR do zero (não tem base i2i). */
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
  const escolha = escolherModeloGeracao(texto);
  if (key) {
    try {
      bytes = await pedirImagem(key, {
        model: escolha.model,
        prompt: texto,
        n: 1,
        ...(aspect_ratio ? { aspect_ratio } : {}),
      });
    } catch (err) {
      console.warn(
        `[Imagem] OpenRouter falhou (${escolha.model}/${escolha.estilo}), fallback Pollinations:`,
        err,
      );
      bytes = await pedirImagemPollinations(texto, aspect_ratio);
    }
  } else {
    bytes = await pedirImagemPollinations(texto, aspect_ratio);
  }

  const { id, url } = await subirImagem(uid, bytes);
  return {
    id,
    url,
    prompt: texto,
    aspectRatio: aspect_ratio,
    custoUsd: bytes.custoUsd,
    model: escolha.model,
    estilo: escolha.estilo,
  };
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
  /** Novo formato pedido explicitamente — dispara outpaint. */
  aspectRatio?: string;
  /**
   * Aspecto da imagem base (última gerada). Usado quando NÃO há pedido de mudar formato,
   * pra o Seedream não cair no default 1:1.
   */
  aspectRatioBase?: string;
  /** true = usuário pediu mudar proporção; false/omitido = preservar. */
  mudarProporcao?: boolean;
  /**
   * Prompt/brief da arte original (quando conhecido). Ancora o sujeito no i2i —
   * especialmente útil em mudança só de estilo («faz realista»).
   */
  briefOriginal?: string;
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
  const mudando = Boolean(opts?.mudarProporcao);
  const aspectNovo = mudando ? normalizarAspectRatio(opts?.aspectRatio) : undefined;
  const aspectBase = normalizarAspectRatio(opts?.aspectRatioBase);
  // Prioridade: mudança explícita > herdar da base > (sem aspecto).
  // NÃO extrair da instrução do LLM — «pose vertical» virava 9:16 por acidente.
  const aspect_ratio = aspectNovo ?? aspectBase;
  const modo: "mudar" | "preservar" | "nenhum" = mudando
    ? "mudar"
    : aspect_ratio
      ? "preservar"
      : "nenhum";

  // Instrução curta demais no outpaint evita o modelo «reescrever a cena» e inventar outro bicho.
  const pedido =
    mudando && aspect_ratio
      ? `Extend this exact image to ${aspect_ratio}. Keep the subject identical. ${texto}`
      : texto;

  const prompt =
    prefixoIdentidadeEdicao(extras.length > 0, opts?.briefOriginal) +
    reforcarAspectoNoPrompt(pedido, aspect_ratio, modo);

  const input_references = [
    { type: "image_url", image_url: { url: baseUrl } },
    ...extras.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  let bytes: { buffer: Buffer; mime: string; custoUsd?: number };
  const key = apiKey();
  if (!key) {
    // Pollinations NÃO recebe a base — cair nele = imagem totalmente outra. Falha explícita.
    throw new Error(
      "Edição de imagem precisa do OpenRouter (a base i2i não funciona no fallback). Tenta de novo já já.",
    );
  }
  const escolha = escolherModeloEdicao(texto, prompt);
  try {
    bytes = await pedirImagem(key, {
      model: escolha.model,
      prompt,
      input_references,
      n: 1,
      ...(aspect_ratio ? { aspect_ratio } : {}),
    });
  } catch (err) {
    // Sem fallback Pollinations na edição — redesenharia do zero e perderia o personagem.
    console.warn(
      `[Imagem] OpenRouter edição falhou (${escolha.model}/${escolha.estilo}, sem fallback i2i):`,
      err,
    );
    throw err instanceof Error
      ? err
      : new Error("Não consegui editar a imagem no OpenRouter.");
  }

  const { id, url } = await subirImagem(uid, bytes);
  return {
    id,
    url,
    prompt: texto,
    aspectRatio: aspect_ratio,
    custoUsd: bytes.custoUsd,
    model: escolha.model,
    estilo: escolha.estilo,
  };
}

/**
 * A última imagem que a Luna desenhou/editou NESTA conversa — para o `editar_imagem` saber em cima
 * de qual imagem mexer, sem depender do modelo carregar a URL longa no contexto. Memória de processo
 * (some se o servidor reiniciar): no pior caso, a edição avisa que não há base e ela redesenha.
 */
type UltimaImagemMem = {
  url: string;
  prompt: string;
  aspectRatio?: AspectRatioOpenRouter;
};
const ultimaImagemPorChave = new Map<string, UltimaImagemMem>();
const LIMITE_CHAVES = 500;

export function registrarUltimaImagem(
  chave: string,
  img: { url: string; prompt: string; aspectRatio?: AspectRatioOpenRouter },
): void {
  if (!chave) return;
  // Poda simples pra memória não crescer sem teto: ao estourar, esvazia (barato e raro).
  if (ultimaImagemPorChave.size >= LIMITE_CHAVES) ultimaImagemPorChave.clear();
  ultimaImagemPorChave.set(chave, {
    url: img.url,
    prompt: img.prompt,
    aspectRatio: img.aspectRatio,
  });
}

export function ultimaImagemDe(chave: string): UltimaImagemMem | undefined {
  return chave ? ultimaImagemPorChave.get(chave) : undefined;
}
