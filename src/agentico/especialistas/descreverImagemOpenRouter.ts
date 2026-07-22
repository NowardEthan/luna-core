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
 * IMAGEM: `gemini-2.5-flash-lite` lê o texto legível tão bem quanto o qwen, mas ~10x
 * mais rápido (≈2,6s vs ≈28s) e com custo parecido — a lentidão do qwen estourava o
 * tempo de resposta quando chegava foto. Ele ainda CHUTA texto que não dá para ler (a
 * placa pequena) — nenhum modelo cura isso sozinho —, por isso a leitura de números/
 * placas passa por uma REVISÃO com um segundo modelo (ver `descreverImagemComRevisao`).
 *
 * VÍDEO: precisa de suporte a `video_url` — nem todo modelo de imagem aceita vídeo —,
 * então mantém-se o multimodal barato com 1M de contexto.
 *
 * REVISOR: um segundo modelo, DIFERENTE do de imagem, para a segunda leitura. Só o que
 * os dois leem igual é afirmado com confiança; o resto vira "não consigo confirmar". Foi
 * escolhido por ser barato E preciso no texto LEGÍVEL — um revisor que lê mal o legível
 * marcaria leitura boa como incerta (falso "não confirmo"). No teste da foto do ônibus,
 * o `mistral-small-3.2` quase não deu falso-positivo e pegou a placa ilegível sempre;
 * saía mais caro e menos preciso com `gpt-4o-mini`.
 */
const MODELO_VISAO_IMAGEM_PADRAO = "google/gemini-2.5-flash-lite";
const MODELO_VISAO_VIDEO_PADRAO = "qwen/qwen3.5-flash-02-23";
const MODELO_VISAO_REVISOR_PADRAO = "mistralai/mistral-small-3.2-24b-instruct";

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
  /** Força um modelo específico (usado pela revisão de segunda opinião). */
  modelo?: string;
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
      model: entrada.modelo?.trim() || modeloVisao(ehVideo),
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

// ── Revisão de segunda opinião (anti-confabulação) ──────────────────────────────
//
// O modelo de imagem lê o texto grande bem, mas INVENTA com confiança o pequeno (a
// placa do fundo) — e de forma ESTÁVEL, então reler com o mesmo modelo não pega. A
// saída é uma SEGUNDA leitura com um modelo DIFERENTE: só o número/placa/código que os
// dois leem IGUAL é afirmado; o resto é marcado como não confirmado, e a Luna é
// instruída a dizer que não consegue ler aquilo — em vez de repetir um chute.
//
// Custo/latência só entram quando a pergunta é de PRECISÃO (número/placa/código…), que
// é onde confabular dói; e as duas leituras correm em paralelo.

/** A pergunta pede um dado exato (onde um dígito errado é grave)? */
export function perguntaPedePrecisao(pergunta?: string): boolean {
  if (!pergunta?.trim()) return false;
  return /(n[uú]mero|placa|matr[ií]cula|c[oó]digo|vers[aã]o|placar|pre[çc]o|valor|data|hora|quant[oa]|d[ií]gito|s[ée]rie|cpf|cnpj|telefone|escrit|l[êe]|ler|diz)/i.test(
    pergunta,
  );
}

/**
 * Tokens "de precisão" numa leitura: sequências alfanuméricas com pelo menos um dígito
 * (placas, números de frota, versões, valores). Junta placas com espaço no meio
 * («WJ07 UNQ» → «WJ07UNQ») para comparar leituras que quebram a placa de formas
 * diferentes.
 */
export function tokensDePrecisao(texto: string): Set<string> {
  const t = texto
    .toUpperCase()
    .replace(/\b([A-Z]{1,3}\d{1,4})\s+([A-Z]{2,4})\b/g, "$1$2");
  const achados = t.match(/[A-Z0-9]{2,}/g) ?? [];
  return new Set(achados.filter((x) => /\d/.test(x) && x.length >= 2));
}

/**
 * Concilia a leitura PRINCIPAL com a da REVISÃO: os tokens de precisão que a principal
 * afirma mas a revisão NÃO confirma (não leu igual) viram "não confirmados". Devolve o
 * texto principal, com um aviso anexado quando houve divergência.
 */
export function conciliarRevisao(
  principal: string,
  revisao: string,
): { texto: string; naoConfirmados: string[] } {
  const daRevisao = tokensDePrecisao(revisao);
  const naoConfirmados = [...tokensDePrecisao(principal)].filter((t) => !daRevisao.has(t));
  if (naoConfirmados.length === 0) return { texto: principal, naoConfirmados };
  const aviso =
    `\n\n[REVISÃO DA VISÃO: uma segunda leitura NÃO bateu nestes trechos: ${naoConfirmados.join(", ")}. ` +
    `Trate-os como INCERTOS: no máximo diga que PARECE aquilo, deixando claro que não tem certeza — ` +
    `nunca afirme um número/placa/código desses como se fosse certo.]`;
  return { texto: `${principal}${aviso}`, naoConfirmados };
}

function revisaoAtiva(): boolean {
  const flag = process.env.OPENROUTER_VISION_REVISAO?.trim();
  return flag !== "0" && flag !== "false";
}

/**
 * Leitura de imagem COM revisão de segunda opinião para perguntas de precisão.
 *
 * É o `descrever` padrão do `visaoGemma`. Para pergunta de precisão, faz duas leituras
 * em paralelo (modelo de imagem + revisor) e concilia; caso contrário, uma leitura só.
 * Vídeo nunca passa pela revisão (é caro e o modelo de vídeo é outro).
 */
export async function descreverImagemComRevisao(entrada: {
  imagem: AnexoImagemChat;
  pergunta?: string;
}): Promise<string> {
  const { imagem, pergunta } = entrada;
  const ehVideo = (imagem.mimeType?.trim() || "").startsWith("video/");

  if (ehVideo || !revisaoAtiva() || !perguntaPedePrecisao(pergunta)) {
    return descreverImagemOpenRouter(entrada);
  }

  const revisor =
    process.env.OPENROUTER_VISION_MODEL_REVISOR?.trim() || MODELO_VISAO_REVISOR_PADRAO;

  const [principal, revisao] = await Promise.allSettled([
    descreverImagemOpenRouter({ imagem, pergunta }),
    descreverImagemOpenRouter({ imagem, pergunta, modelo: revisor }),
  ]);

  // A leitura principal é obrigatória; se ela falhou, propaga o erro (o visaoGemma trata).
  if (principal.status !== "fulfilled") throw principal.reason;
  // Se a revisão falhou, entrega a principal sem penalizar (melhor que não responder).
  if (revisao.status !== "fulfilled") return principal.value;

  return conciliarRevisao(principal.value, revisao.value).texto;
}
