import type { AnexoImagemChat } from "./visaoGemma.js";

/**
 * Olhos da Luna — modelo multimodal via OpenRouter.
 *
 * Isto é o que a ferramenta `ver_imagem` chama. Repara na diferença para o antigo
 * `/v1/vision`: ali um modelo escrevia UM parágrafo genérico sobre a foto, sem saber
 * o que a Luna queria; aqui vai a PERGUNTA dela ("qual o placar no canto?"), e a
 * resposta volta para dentro do raciocínio dela.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Multimodal (texto + imagem + VÍDEO), 1M de contexto e barato — o `:free` do Gemma
 * esbarrava no rate limit. Trocável por `OPENROUTER_VISION_MODEL`.
 */
const MODELO_VISAO_PADRAO = "qwen/qwen3.5-flash-02-23";

function instrucaoBase(ehVideo: boolean): string {
  const midia = ehVideo ? "este vídeo" : "esta imagem";
  return [
    `Você é os olhos de uma pessoa que não pode ver ${midia}.`,
    "Responda em português do Brasil, de forma factual e concreta.",
    "Transcreva TODO texto legível (OCR): placares, números, rótulos, marcas, o que estiver escrito em canecas, telas, camisas, placas.",
    ehVideo
      ? "Descreva o que ACONTECE ao longo do vídeo — a sequência, o que muda, quem faz o quê, e em que momento."
      : "Descreva o que está de facto na imagem — objetos, pessoas, cores, disposição.",
    "NÃO especule nem invente. Se algo estiver ilegível, cortado ou borrado, diga exatamente isso ('o placar no canto está borrado, não consigo ler').",
    "Admitir que não dá para ver é sempre melhor do que adivinhar.",
    "Responda só com a análise, sem preâmbulo.",
  ].join(" ");
}

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

/** Env própria — `LUNA_VISION_MODEL` é do descritor antigo (Groq) e apontaria para o modelo errado. */
function modeloVisao(): string {
  return process.env.OPENROUTER_VISION_MODEL?.trim() || MODELO_VISAO_PADRAO;
}

/** Há chave para ligar os olhos? Se não, o visaoGemma cai no fallback. */
export function visaoOpenRouterDisponivel(): boolean {
  return Boolean(apiKey());
}

export async function descreverImagemOpenRouter(entrada: {
  imagem: AnexoImagemChat;
  pergunta?: string;
}): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — visão indisponível.");

  const { imagem, pergunta } = entrada;
  const mime = imagem.mimeType?.trim() || "image/jpeg";
  const ehVideo = mime.startsWith("video/");
  const dataUrl = `data:${mime};base64,${imagem.imageBase64}`;

  const base = instrucaoBase(ehVideo);
  const instrucao = pergunta?.trim()
    ? `${base}\n\nPergunta específica sobre ${ehVideo ? "o vídeo" : "a imagem"}: ${pergunta.trim()}\nResponda a essa pergunta primeiro; depois acrescente o que mais for relevante.`
    : base;

  // O OpenRouter distingue os tipos: vídeo entra como `video_url`, não `image_url`.
  const conteudoMidia = ehVideo
    ? { type: "video_url", video_url: { url: dataUrl } }
    : { type: "image_url", image_url: { url: dataUrl } };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modeloVisao(),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: instrucao }, conteudoMidia],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 240);
    throw new Error(`Visão falhou (${res.status}): ${corpo}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const texto = data.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new Error("O modelo de visão não devolveu descrição.");
  return texto;
}
