import type { AnexoDocumentoChat } from "./leitorDocumento.js";

/**
 * A bibliotecária: lê os trechos escolhidos e responde à pergunta da Luna.
 *
 * É o gêmeo do `descreverImagemOpenRouter`. A diferença que importa: sem isto, responder
 * «o que o documento diz sobre X?» exigiria despejar o arquivo inteiro no contexto da
 * Luna. Aqui só os trechos relevantes vão a um modelo barato, e ela recebe a RESPOSTA.
 * Ela paga pelo que lê, não pelo que existe.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Barato e com janela grande — cabe um capítulo inteiro sem sufocar. */
const MODELO_LEITOR_PADRAO = "qwen/qwen3.5-flash-02-23";

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function modeloLeitor(): string {
  return process.env.OPENROUTER_LEITOR_MODEL?.trim() || MODELO_LEITOR_PADRAO;
}

export function leitorOpenRouterDisponivel(): boolean {
  return Boolean(apiKey());
}

const INSTRUCAO = [
  "Você leu os trechos abaixo de um documento e vai responder à pergunta de quem não os leu.",
  "Responda em português do Brasil, direto ao ponto, com o que está DE FACTO nos trechos.",
  "Cite a parte de onde tirou cada coisa (ex.: «na parte 3, ele escreve...»). Se der, use as palavras do próprio documento entre aspas.",
  "Se a resposta NÃO estiver nos trechos, diga exatamente isso — «isto não está nas partes que li» — e sugira em que outra parte poderia estar.",
  "NUNCA invente conteúdo, número de página, citação ou conclusão que não esteja no texto.",
  "Sem preâmbulo: comece pela resposta.",
].join(" ");

export async function responderSobreTrechosOpenRouter(entrada: {
  documento: AnexoDocumentoChat;
  pergunta: string;
  trechos: { parte: number; texto: string }[];
}): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — leitor indisponível.");

  const { documento, pergunta, trechos } = entrada;

  const corpo = trechos
    .map((t) => `── parte ${t.parte} ──\n${t.texto}`)
    .join("\n\n");

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
      model: modeloLeitor(),
      messages: [
        {
          role: "user",
          content: `${INSTRUCAO}\n\nDocumento: ${documento.nome ?? "sem nome"}\n\n${corpo}\n\n── Pergunta ──\n${pergunta}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const detalhe = (await res.text()).slice(0, 240);
    throw new Error(`Leitura falhou (${res.status}): ${detalhe}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const texto = data.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new Error("O leitor não devolveu resposta.");
  return texto;
}
