import type {
  ProvedorLlm,
  RequisicaoCompletacao,
  RespostaCompletacao,
} from "./tipos.js";

type OpcoesOpenAi = {
  apiKey: string;
  baseUrl: string;
  maxTentativas?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extrairEsperaSegundos(corpoErro: string): number | null {
  const match = corpoErro.match(/try again in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]!) * 1000);
}

async function fetchComRetry(
  url: string,
  init: RequestInit,
  maxTentativas: number,
): Promise<Response> {
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const resposta = await fetch(url, init);

    if (resposta.ok) return resposta;

    const erro = await resposta.text();
    ultimoErro = erro;

    const retryavel = resposta.status === 429 || resposta.status === 503;
    if (!retryavel || tentativa === maxTentativas) {
      throw new Error(
        `LLM ${resposta.status} após ${tentativa} tentativa(s): ${erro}. ` +
          `Se 429 persistir, aumente LUNA_API_PAUSA_MS ou reduza chamadas --ab.`,
      );
    }

    const espera = extrairEsperaSegundos(erro) ?? tentativa * 5000;
    await sleep(espera);
  }

  throw new Error(`LLM falhou após ${maxTentativas} tentativas: ${ultimoErro}`);
}

/**
 * Provedor compatível com OpenAI Chat Completions.
 * Funciona com OpenAI, Groq, Together, Ollama (/v1), etc.
 * Retenta automaticamente em rate limit (429).
 */
export function criarProvedorOpenAi(opcoes: OpcoesOpenAi): ProvedorLlm {
  const url = opcoes.baseUrl.replace(/\/$/, "");
  const maxTentativas = opcoes.maxTentativas ?? 5;

  return {
    async completar(requisicao: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      const inicio = Date.now();

      const corpo: Record<string, unknown> = {
        model: requisicao.modelo,
        messages: requisicao.mensagens.map((m) => ({
          role: m.papel,
          content: m.conteudo,
        })),
        temperature: requisicao.temperatura,
      };

      if (requisicao.json) {
        corpo.response_format = { type: "json_object" };
      }

      const resposta = await fetchComRetry(
        `${url}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opcoes.apiKey}`,
          },
          body: JSON.stringify(corpo),
        },
        maxTentativas,
      );

      const json = (await resposta.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };

      const conteudo = json.choices?.[0]?.message?.content?.trim() ?? "";

      return {
        conteudo,
        modelo: json.model ?? requisicao.modelo,
        latencia_ms: Date.now() - inicio,
      };
    },
  };
}
