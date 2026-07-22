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
 * O modelo de visão é escolhido pelo TIPO de mídia — imagem e vídeo têm padrões
 * diferentes de propósito.
 *
 * IMAGEM: um "flash" barato lê o texto grande, mas INVENTA com confiança o que não
 * dá para ler (placa pequena, número borrado) em vez de admitir — foi o bug do painel
 * do ônibus. Para OCR preferimos um modelo que, quando não lê, tende a abster-se
 * ("ILEGÍVEL") em vez de chutar. Não cura 100% (nenhum modelo cura texto ilegível),
 * mas erra bem menos e é mais rápido.
 *
 * VÍDEO: precisa de suporte a `video_url` — nem todo modelo de imagem aceita vídeo —,
 * então mantém-se o multimodal barato com 1M de contexto.
 */
const MODELO_VISAO_IMAGEM_PADRAO = "openai/gpt-4o";
const MODELO_VISAO_VIDEO_PADRAO = "qwen/qwen3.5-flash-02-23";

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
    // Números são o ponto fraco: um "2.5.2" mal lido vira "2.5.8" e a Luna repete com
    // toda a confiança, porque não tem como saber que o dígito foi um chute.
    "Cuidado redobrado com NÚMEROS (versões, placares, valores, datas, códigos): copie dígito por dígito. Se não tiver certeza de um único dígito, diga que o número não está legível — nunca complete de cabeça.",
    "Admitir que não dá para ver é sempre melhor do que adivinhar.",
    "Responda só com a análise, sem preâmbulo.",
  ].join(" ");
}

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

/**
 * Modelo de visão para o tipo de mídia.
 *
 * Overrides (em ordem de prioridade): o específico do tipo
 * (`OPENROUTER_VISION_MODEL_IMAGE` / `OPENROUTER_VISION_MODEL_VIDEO`) e depois o global
 * `OPENROUTER_VISION_MODEL` (retrocompat — antes valia para os dois). `LUNA_VISION_MODEL`
 * é do descritor antigo (Groq) e apontaria para o modelo errado, por isso não é lido aqui.
 */
export function modeloVisao(ehVideo: boolean): string {
  const especifico = ehVideo
    ? process.env.OPENROUTER_VISION_MODEL_VIDEO?.trim()
    : process.env.OPENROUTER_VISION_MODEL_IMAGE?.trim();
  const padrao = ehVideo ? MODELO_VISAO_VIDEO_PADRAO : MODELO_VISAO_IMAGEM_PADRAO;
  return especifico || process.env.OPENROUTER_VISION_MODEL?.trim() || padrao;
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

  // URL do Storage quando existe: o modelo busca o arquivo direto, sem carregar
  // megabytes de base64 no pedido. O base64 fica como alternativa (sem nuvem).
  const fonte = imagem.url?.trim()
    ? imagem.url.trim()
    : imagem.imageBase64
      ? `data:${mime};base64,${imagem.imageBase64}`
      : null;
  if (!fonte) throw new Error("Anexo sem url nem base64 — nada para olhar.");

  const base = instrucaoBase(ehVideo);
  const instrucao = pergunta?.trim()
    ? `${base}\n\nPergunta específica sobre ${ehVideo ? "o vídeo" : "a imagem"}: ${pergunta.trim()}\nResponda a essa pergunta primeiro; depois acrescente o que mais for relevante.`
    : base;

  // O OpenRouter distingue os tipos: vídeo entra como `video_url`, não `image_url`.
  const conteudoMidia = ehVideo
    ? { type: "video_url", video_url: { url: fonte } }
    : { type: "image_url", image_url: { url: fonte } };

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
      model: modeloVisao(ehVideo),
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
