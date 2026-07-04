import type {
  ProvedorLlm,
  ProvedorAgente,
  RequisicaoCompletacao,
  RespostaCompletacao,
  RequisicaoAgente,
  RespostaAgente,
  MensagemChatAgente,
  ChamadaFerramenta,
  DefinicaoFerramenta,
} from "./tipos.js";
import {
  erroPermiteRetrySemJsonEstrito,
  usarJsonEstritoOpenAi,
} from "./extrairJsonResposta.js";
import {
  aplicarCorpoRaciocinio,
  resolverRaciocinioResposta,
} from "./raciocinioApi.js";

type OpcoesOpenAi = {
  apiKey: string;
  baseUrl: string;
  maxTentativas?: number;
};

function buildLlmHeaders(apiKey: string, baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://github.com/luna-orbit";
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE?.trim() || "Luna Orbit Mobile";
  }
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extrairEsperaSegundos(corpoErro: string): number | null {
  const match = corpoErro.match(/try again in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]!) * 1000);
}

function formatarErroLlm(status: number, erro: string, baseUrl?: string): string {
  const isOpenRouter = baseUrl?.includes("openrouter.ai") ?? false;
  const provedor = isOpenRouter ? "OpenRouter" : "Groq";
  if (
    erro.includes("rate_limit_exceeded") ||
    erro.includes("Request too large") ||
    (erro.includes("Limit") && erro.includes("Requested"))
  ) {
    if (isOpenRouter) {
      return (
        `LLM ${status}: pedido grande demais ou limite do modelo free no OpenRouter. ` +
        "Tente uma conversa nova ou escolha Groq nas definições."
      );
    }
    return (
      `LLM ${status}: a mensagem ficou grande demais para o modelo Groq (limite ~8000 tokens). ` +
      "Com PDFs longos, usa «Referenciar trecho» no visualizador ou pergunta sobre uma parte específica. " +
      "Se persistir, reduz o histórico da conversa ou faz uma conversa nova."
    );
  }
  if (status === 429 || status === 503) {
    return (
      `LLM ${status}: limite de pedidos do ${provedor}. Aguarda alguns segundos e tenta de novo.`
    );
  }
  let detail = erro.slice(0, 280);
  try {
    const json = JSON.parse(erro) as { error?: { message?: string } };
    if (json.error?.message) detail = json.error.message.slice(0, 280);
  } catch {
    /* corpo não-JSON */
  }
  return `LLM ${status} após tentativa(s): ${detail}`;
}

async function fetchComRetry(
  url: string,
  init: RequestInit,
  maxTentativas: number,
  baseUrl?: string,
): Promise<Response> {
  let ultimoErro = "";
  const provedorBase = baseUrl ?? url.replace(/\/chat\/completions.*$/i, "");

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const resposta = await fetch(url, init);

    if (resposta.ok) return resposta;

    const erro = await resposta.text();
    ultimoErro = erro;

    if (resposta.status === 413) {
      throw new Error(formatarErroLlm(resposta.status, erro, provedorBase));
    }

    const retryavel = resposta.status === 429 || resposta.status === 503;
    if (!retryavel || tentativa === maxTentativas) {
      throw new Error(formatarErroLlm(resposta.status, erro, provedorBase));
    }

    const espera = extrairEsperaSegundos(erro) ?? tentativa * 5000;
    await sleep(espera);
  }

  throw new Error(`LLM falhou após ${maxTentativas} tentativas: ${ultimoErro}`);
}

async function completarUmaVez(
  url: string,
  apiKey: string,
  requisicao: RequisicaoCompletacao,
  maxTentativas: number,
  jsonEstrito: boolean,
): Promise<RespostaCompletacao> {
  const inicio = Date.now();

  const corpo: Record<string, unknown> = {
    model: requisicao.modelo,
    messages: requisicao.mensagens.map((m) => ({
      role: m.papel,
      content: m.conteudo,
    })),
    temperature: requisicao.temperatura,
  };

  if (requisicao.json && jsonEstrito) {
    corpo.response_format = { type: "json_object" };
  }

  const raciocinioAtivo = requisicao.raciocinioAtivo !== false;
  aplicarCorpoRaciocinio(
    corpo,
    requisicao.modelo,
    url,
    raciocinioAtivo,
    false,
  );

  const resposta = await fetchComRetry(
    `${url}/chat/completions`,
    {
      method: "POST",
      headers: buildLlmHeaders(apiKey, url),
      body: JSON.stringify(corpo),
    },
    maxTentativas,
    url,
  );

  const json = (await resposta.json()) as {
    model?: string;
    choices?: Array<{ message?: Record<string, unknown> }>;
  };

  const mensagem = json.choices?.[0]?.message;
  let conteudo =
    typeof mensagem?.content === "string" ? mensagem.content.trim() : "";
  const resolvido = resolverRaciocinioResposta(mensagem, conteudo);
  conteudo = resolvido.conteudo;

  return {
    conteudo,
    raciocinio: resolvido.raciocinio,
    modelo: json.model ?? requisicao.modelo,
    latencia_ms: Date.now() - inicio,
  };
}

// ─── Serialização de mensagens agênticas ──────────────────────────────────

function serializarMensagemAgente(m: MensagemChatAgente): Record<string, unknown> {
  if (m.papel === "ferramenta") {
    return {
      role: "tool",
      tool_call_id: m.id_chamada,
      name: m.nome,
      content: m.conteudo,
    };
  }
  if (m.papel === "assistant" && m.chamadas_ferramenta?.length) {
    return {
      role: "assistant",
      content: m.conteudo ?? null,
      tool_calls: m.chamadas_ferramenta.map((c) => ({
        id: c.id,
        type: "function",
        function: {
          name: c.nome,
          arguments: JSON.stringify(c.argumentos),
        },
      })),
    };
  }
  return { role: m.papel, content: (m as { conteudo: string }).conteudo };
}

function serializarFerramentas(
  ferramentas: DefinicaoFerramenta[],
): Record<string, unknown>[] {
  return ferramentas.map((f) => ({
    type: "function",
    function: {
      name: f.nome,
      description: f.descricao,
      parameters: f.parametros,
    },
  }));
}

function parsearChamadas(
  toolCalls: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
): ChamadaFerramenta[] {
  return toolCalls
    .map((tc) => {
      const nome = tc.function?.name ?? "";
      let argumentos: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function?.arguments ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          argumentos = parsed as Record<string, unknown>;
        }
      } catch {
        // argumentos ficam vazios — executor trata como parâmetros ausentes
      }
      return { id: tc.id ?? crypto.randomUUID(), nome, argumentos };
    })
    .filter((c) => c.nome.length > 0);
}

async function completarComFerramentasUmaVez(
  url: string,
  apiKey: string,
  requisicao: RequisicaoAgente,
  maxTentativas: number,
): Promise<RespostaAgente> {
  const inicio = Date.now();

  const corpo: Record<string, unknown> = {
    model: requisicao.modelo,
    messages: requisicao.mensagens.map(serializarMensagemAgente),
    temperature: requisicao.temperatura,
  };

  if (requisicao.ferramentas?.length) {
    corpo.tools = serializarFerramentas(requisicao.ferramentas);
    corpo.tool_choice = "auto";
  }

  const raciocinioAtivo = requisicao.raciocinioAtivo !== false;
  aplicarCorpoRaciocinio(
    corpo,
    requisicao.modelo,
    url,
    raciocinioAtivo,
    Boolean(requisicao.ferramentas?.length),
  );

  const resposta = await fetchComRetry(
    `${url}/chat/completions`,
    {
      method: "POST",
      headers: buildLlmHeaders(apiKey, url),
      body: JSON.stringify(corpo),
    },
    maxTentativas,
    url,
  );

  const json = (await resposta.json()) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };

  const mensagem = json.choices?.[0]?.message;
  const modelo = json.model ?? requisicao.modelo;
  const latencia_ms = Date.now() - inicio;
  const raciocinioApi = resolverRaciocinioResposta(mensagem, "").raciocinio;

  const toolCalls = mensagem?.tool_calls;
  if (toolCalls?.length) {
    const chamadas = parsearChamadas(toolCalls);
    if (chamadas.length > 0) {
      return {
        chamadas,
        raciocinio: raciocinioApi,
        modelo,
        latencia_ms,
      };
    }
  }

  let conteudo = mensagem?.content?.trim() ?? "";
  const resolvido = resolverRaciocinioResposta(mensagem, conteudo);
  conteudo = resolvido.conteudo;
  return {
    conteudo,
    raciocinio: resolvido.raciocinio ?? raciocinioApi,
    modelo,
    latencia_ms,
  };
}

// ─── Provider público ──────────────────────────────────────────────────────

/**
 * Provedor compatível com OpenAI Chat Completions.
 * Funciona com OpenAI, Groq, Together, Ollama (/v1), LM Studio, etc.
 * Retenta automaticamente em rate limit (429).
 * Provedores locais: JSON via prompt (sem response_format) — neurónios análise/memória.
 * V3: suporta tool calling via `completarComFerramentas`.
 */
export function criarProvedorOpenAi(opcoes: OpcoesOpenAi): ProvedorAgente {
  const url = opcoes.baseUrl.replace(/\/$/, "");
  const maxTentativas = opcoes.maxTentativas ?? 5;
  const jsonEstritoDefault = usarJsonEstritoOpenAi(url);

  return {
    async completar(requisicao: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      if (!requisicao.json) {
        return completarUmaVez(
          url,
          opcoes.apiKey,
          requisicao,
          maxTentativas,
          false,
        );
      }

      if (!jsonEstritoDefault) {
        return completarUmaVez(
          url,
          opcoes.apiKey,
          requisicao,
          maxTentativas,
          false,
        );
      }

      try {
        return await completarUmaVez(
          url,
          opcoes.apiKey,
          requisicao,
          maxTentativas,
          true,
        );
      } catch (erro) {
        if (!erroPermiteRetrySemJsonEstrito(erro)) throw erro;
        return completarUmaVez(
          url,
          opcoes.apiKey,
          requisicao,
          maxTentativas,
          false,
        );
      }
    },

    async completarComFerramentas(
      requisicao: RequisicaoAgente,
    ): Promise<RespostaAgente> {
      return completarComFerramentasUmaVez(
        url,
        opcoes.apiKey,
        requisicao,
        maxTentativas,
      );
    },
  };
}
