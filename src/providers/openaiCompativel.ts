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
import { serializarCorpoLlm } from "./cerebrasPayload.js";
import { lerCorpoSseStreamAgente } from "./streamAgente.js";
import { randomUUID } from "node:crypto";

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

function llmFetchTimeoutMs(): number {
  const raw = process.env.LUNA_LLM_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 120_000;
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function signalComTimeout(init: RequestInit, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!init.signal) return timeoutSignal;
  const merged = AbortSignal.any([init.signal, timeoutSignal]);
  return merged;
}

function extrairEsperaSegundos(corpoErro: string): number | null {
  const match = corpoErro.match(/try again in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]!) * 1000);
}

function formatarErroLlm(status: number, erro: string, baseUrl?: string): string {
  const isOpenRouter = baseUrl?.includes("openrouter.ai") ?? false;
  const isCerebras = /cerebras\.ai/i.test(baseUrl ?? "");
  const provedor = isOpenRouter ? "OpenRouter" : isCerebras ? "Cerebras" : "Groq";
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
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        ...init,
        signal: signalComTimeout(init, llmFetchTimeoutMs()),
      });
    } catch (err) {
      // A2 (Confiabilidade): falha de REDE/timeout — DNS ("Unable to resolve host"),
      // ECONNRESET, ou o nosso próprio timeout. Foram estas que engoliram o "te amo".
      // Uma completação é sem efeito colateral → retentar é seguro e barato (o DNS
      // costuma falhar rápido). MAS: se quem chamou abortou (client desistiu / timeout
      // externo), não insiste.
      if (init.signal?.aborted) throw err;
      ultimoErro = err instanceof Error ? err.message : String(err);
      if (tentativa === maxTentativas) {
        throw new Error(
          `LLM indisponível (rede/timeout) após ${maxTentativas} tentativas: ${ultimoErro}`,
        );
      }
      await sleep(Math.min(tentativa * 1500, 6000));
      continue;
    }

    if (resposta.ok) return resposta;

    const erro = await resposta.text();
    ultimoErro = erro;

    if (resposta.status === 413) {
      throw new Error(formatarErroLlm(resposta.status, erro, provedorBase));
    }

    // A2: além de 429/503, os 5xx transitórios (500/502/504) também são retentáveis.
    const retryavel =
      resposta.status === 429 || (resposta.status >= 500 && resposta.status <= 504);
    if (!retryavel || tentativa === maxTentativas) {
      throw new Error(formatarErroLlm(resposta.status, erro, provedorBase));
    }

    const espera = extrairEsperaSegundos(erro) ?? Math.min(tentativa * 2000, 8000);
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
    ...(requisicao.maxTokens ? { max_tokens: requisicao.maxTokens } : {}),
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
    requisicao.raciocinioEffort,
  );

  const { body, headers: bodyHeaders } = serializarCorpoLlm(corpo, url);
  const headers = { ...buildLlmHeaders(apiKey, url), ...bodyHeaders };

  const resposta = await fetchComRetry(
    `${url}/chat/completions`,
    {
      method: "POST",
      headers,
      body,
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

function nomePseudoFerramenta(nome: string): string {
  const normalizado = nome.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (
    normalizado === "gen_images" ||
    normalizado === "generate_image" ||
    normalizado === "image_generation" ||
    normalizado === "gerar_imagem"
  ) {
    return "gerar_imagem";
  }
  if (
    normalizado === "edit_image" ||
    normalizado === "image_edit" ||
    normalizado === "editar_imagem"
  ) {
    return "editar_imagem";
  }
  return normalizado;
}

function extrairObjetosJson(texto: string, inicio: number): { fim: number; json: string } | null {
  const abre = texto.indexOf("{", inicio);
  if (abre < 0) return null;
  let profundidade = 0;
  let emString = false;
  let escape = false;
  for (let i = abre; i < texto.length; i++) {
    const ch = texto[i]!;
    if (emString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        emString = false;
      }
      continue;
    }
    if (ch === "\"") {
      emString = true;
    } else if (ch === "{") {
      profundidade += 1;
    } else if (ch === "}") {
      profundidade -= 1;
      if (profundidade === 0) return { fim: i + 1, json: texto.slice(abre, i + 1) };
    }
  }
  return null;
}

function primeiroTexto(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const texto = primeiroTexto(item);
      if (texto) return texto;
    }
  }
  return "";
}

function normalizarArgsPseudoFerramenta(
  nome: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (nome === "gerar_imagem") {
    const prompt =
      primeiroTexto(args.prompt) ||
      primeiroTexto(args.query) ||
      primeiroTexto(args.queries) ||
      primeiroTexto(args.description);
    return {
      ...args,
      ...(prompt ? { prompt } : {}),
      ...(typeof args.aspect_ratio === "string" ? { aspect_ratio: args.aspect_ratio } : {}),
    };
  }
  if (nome === "editar_imagem") {
    const instrucao =
      primeiroTexto(args.instrucao) ||
      primeiroTexto(args.prompt) ||
      primeiroTexto(args.query) ||
      primeiroTexto(args.queries);
    return {
      ...args,
      ...(instrucao ? { instrucao } : {}),
    };
  }
  return args;
}

function parsearPseudoFerramentasNoTexto(
  texto: string,
  ferramentas?: DefinicaoFerramenta[],
): { texto: string; chamadas: ChamadaFerramenta[]; detectou: boolean } {
  if (!texto || !/\[Tool:/i.test(texto)) return { texto, chamadas: [], detectou: false };

  const disponiveis = new Set((ferramentas ?? []).map((f) => f.nome));
  const chamadas: ChamadaFerramenta[] = [];
  let limpo = "";
  let cursor = 0;
  const marcador = /\[Tool:\s*([^\]\s]+)\s*\]/gi;
  let match: RegExpExecArray | null;

  while ((match = marcador.exec(texto)) !== null) {
    const bruto = match[1] ?? "";
    const nome = nomePseudoFerramenta(bruto);
    const obj = extrairObjetosJson(texto, marcador.lastIndex);
    if (!obj) continue;

    limpo += texto.slice(cursor, match.index);
    cursor = obj.fim;
    marcador.lastIndex = obj.fim;

    if (disponiveis.size > 0 && !disponiveis.has(nome)) continue;

    try {
      const parsed = JSON.parse(obj.json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        chamadas.push({
          id: randomUUID(),
          nome,
          argumentos: normalizarArgsPseudoFerramenta(nome, parsed as Record<string, unknown>),
        });
      }
    } catch {
      /* se o JSON veio invalido, so removemos o bloco visivel */
    }
  }

  if (cursor === 0) return { texto, chamadas: [], detectou: false };
  limpo += texto.slice(cursor);
  return { texto: limpo.trim(), chamadas, detectou: true };
}

async function completarComFerramentasUmaVez(
  url: string,
  apiKey: string,
  requisicao: RequisicaoAgente,
  maxTentativas: number,
): Promise<RespostaAgente> {
  // A6.1: com onDelta, streama content/reasoning ao vivo e acumula tool_calls.
  if (requisicao.onDelta) {
    try {
      return await completarComFerramentasStream(url, apiKey, requisicao, maxTentativas);
    } catch (erro) {
      // Fallback: alguns provedores rejeitam stream+tools — tenta sem stream.
      const msg = erro instanceof Error ? erro.message : String(erro);
      if (!/LLM|stream|tools|400|404/i.test(msg)) throw erro;
    }
  }
  return completarComFerramentasJson(url, apiKey, requisicao, maxTentativas);
}

async function completarComFerramentasStream(
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
    stream: true,
    ...(requisicao.maxTokens ? { max_tokens: requisicao.maxTokens } : {}),
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
    requisicao.raciocinioEffort,
  );

  const { body, headers: bodyHeaders } = serializarCorpoLlm(corpo, url);
  const headers = { ...buildLlmHeaders(apiKey, url), ...bodyHeaders };

  const resposta = await fetchComRetry(
    `${url}/chat/completions`,
    { method: "POST", headers, body },
    maxTentativas,
    url,
  );

  let conteudo = "";
  let conteudoPendente = "";
  let raciocinio = "";
  let modelo = requisicao.modelo;
  const toolAcc = new Map<
    number,
    { id: string; nome: string; argumentosJson: string }
  >();

  await lerCorpoSseStreamAgente(resposta.body, (chunk) => {
    if (chunk.tipo === "modelo") {
      modelo = chunk.modelo;
      return;
    }
    if (chunk.tipo === "content") {
      conteudo += chunk.delta;
      if (requisicao.ferramentas?.length) {
        conteudoPendente += chunk.delta;
        if (!/\[Tool:/i.test(conteudoPendente) && conteudoPendente.length > 512) {
          const emitir = conteudoPendente.slice(0, conteudoPendente.length - 512);
          conteudoPendente = conteudoPendente.slice(-512);
          requisicao.onDelta?.({ tipo: "content", delta: emitir });
        }
      } else {
        requisicao.onDelta?.({ tipo: "content", delta: chunk.delta });
      }
      return;
    }
    if (chunk.tipo === "reasoning") {
      raciocinio += chunk.delta;
      requisicao.onDelta?.({ tipo: "reasoning", delta: chunk.delta });
      return;
    }
    if (chunk.tipo === "tool_call_delta") {
      const cur = toolAcc.get(chunk.index) ?? {
        id: "",
        nome: "",
        argumentosJson: "",
      };
      if (chunk.id) cur.id = chunk.id;
      if (chunk.nome) cur.nome = chunk.nome;
      if (chunk.argumentosDelta) cur.argumentosJson += chunk.argumentosDelta;
      toolAcc.set(chunk.index, cur);
    }
  });

  const latencia_ms = Date.now() - inicio;
  const resolvido = resolverRaciocinioResposta(
    { content: conteudo, reasoning: raciocinio || undefined },
    conteudo,
  );
  const conteudoFinal = resolvido.conteudo.trim();
  const raciocinioFinal = resolvido.raciocinio ?? (raciocinio.trim() || undefined);
  const pseudo = parsearPseudoFerramentasNoTexto(conteudoFinal, requisicao.ferramentas);

  const chamadas: ChamadaFerramenta[] = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => {
      let argumentos: Record<string, unknown> = {};
      try {
        argumentos = JSON.parse(tc.argumentosJson || "{}") as Record<string, unknown>;
      } catch {
        argumentos = {};
      }
      return {
        id: tc.id || randomUUID(),
        nome: tc.nome,
        argumentos,
      };
    })
    .filter((c) => c.nome.length > 0);

  const chamadasEfetivas = chamadas.length > 0 ? chamadas : pseudo.chamadas;

  if (chamadasEfetivas.length > 0) {
    return {
      ...(!pseudo.detectou && conteudoFinal ? { conteudo: conteudoFinal } : {}),
      chamadas: chamadasEfetivas,
      raciocinio: raciocinioFinal,
      modelo,
      latencia_ms,
    };
  }

  if (requisicao.ferramentas?.length && conteudoPendente && !pseudo.detectou) {
    requisicao.onDelta?.({ tipo: "content", delta: conteudoPendente });
  }

  return {
    conteudo: pseudo.texto || conteudoFinal,
    raciocinio: raciocinioFinal,
    modelo,
    latencia_ms,
  };
}

async function completarComFerramentasJson(
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
    ...(requisicao.maxTokens ? { max_tokens: requisicao.maxTokens } : {}),
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
    requisicao.raciocinioEffort,
  );

  const { body, headers: bodyHeaders } = serializarCorpoLlm(corpo, url);
  const headers = { ...buildLlmHeaders(apiKey, url), ...bodyHeaders };

  const resposta = await fetchComRetry(
    `${url}/chat/completions`,
    {
      method: "POST",
      headers,
      body,
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
  let conteudoBruto = typeof mensagem?.content === "string" ? mensagem.content.trim() : "";
  const resolvido = resolverRaciocinioResposta(mensagem, conteudoBruto);
  const conteudo = resolvido.conteudo.trim();
  const raciocinio = resolvido.raciocinio ?? raciocinioApi;
  const pseudo = parsearPseudoFerramentasNoTexto(conteudo, requisicao.ferramentas);

  if (toolCalls?.length) {
    const chamadas = parsearChamadas(toolCalls);
    if (chamadas.length > 0) {
      return {
        ...(conteudo ? { conteudo } : {}),
        chamadas,
        raciocinio,
        modelo,
        latencia_ms,
      };
    }
  }

  if (pseudo.chamadas.length > 0) {
    return {
      chamadas: pseudo.chamadas,
      raciocinio,
      modelo,
      latencia_ms,
    };
  }

  return {
    conteudo: pseudo.texto || conteudo,
    raciocinio,
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
