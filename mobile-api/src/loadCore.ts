import { pathToFileURL } from "node:url";

import { prepararMemoriaGlobalMobile } from "./crossSessionContext.js";
import { resolveLunaCoreEntry, resolveLunaCorePath } from "./resolveCorePath.js";
import {
  isStreamSupported,
  resolveLlmConfig,
  resolveLlmProviderSelection,
  type ConfigLuna,
  type LlmProviderSelection,
} from "./llmProviders.js";
import type { PlanId } from "./billing/planMapping.js";
import { compactarSessaoPersistida } from "./sessaoMobile.js";
import { truncateMobileChatMessage } from "./truncateForGroq.js";

export type ChatStreamCallbacks = {
  onStatus?: (phase: "analysing" | "memory" | "writing") => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
};

export type ChatMobileResult = {
  text: string;
  reasoning?: string;
  sessionId: string;
  turnCount: number;
  provider: LlmProviderSelection;
  providerReason?: string;
  autoMode?: boolean;
};

export type LunaCoreModule = {
  executarPipelineCompleto: (
    mensagem: string,
    opcoes?: {
      sessaoId?: string;
      ambiente?: string;
      detalhe_ambiente?: string;
      gerarResposta?: boolean;
      raciocinioAtivo?: boolean;
      usarNeuronioMemoriaLlm?: boolean;
      contexto_cross_sessao?: string[];
      config?: ConfigLuna;
      stream?: boolean;
      onStatusHint?: (hint: string) => void;
      onStreamReasoningDelta?: (delta: string) => void;
      onStreamContentDelta?: (delta: string) => void;
    },
  ) => Promise<{
    resposta?: { texto?: string; raciocinio?: string };
    sessao?: { id?: string; mensagens?: unknown[] };
    log_path: string;
  }>;
  prepararSessaoOrbit: (sessaoId: string) => unknown;
  buscarContextoOutrasSessoes: (
    mensagem: string,
    sessaoAtualId: string,
    maxSessoes?: number,
    opcoes?: { sempreAtivo?: boolean },
  ) => string[];
  hidratarSessaoOrbit: (
    sessaoId: string,
    mensagens: Array<{ papel: "user" | "assistant"; conteudo: string; timestamp: string }>,
  ) => unknown;
};

let cached: Promise<LunaCoreModule> | null = null;

export async function loadLunaCoreModule(): Promise<LunaCoreModule> {
  if (!cached) cached = importCore();
  return cached;
}

async function importCore(): Promise<LunaCoreModule> {
  const corePath = resolveLunaCorePath();
  const entry = resolveLunaCoreEntry(corePath);
  const mod = (await import(pathToFileURL(entry).href)) as LunaCoreModule;

  if (typeof mod.executarPipelineCompleto !== "function") {
    throw new Error("entry-desktop.js não exporta executarPipelineCompleto");
  }

  return mod;
}

function nomeInterlocutorMobile(userDisplayName?: string): string | undefined {
  const nome = userDisplayName?.trim();
  if (!nome) return undefined;
  const lower = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const reservados = new Set([
    "luna",
    "luninha",
    "lu",
    "luquinha",
    "lunona",
    "voce",
    "você",
  ]);
  if (reservados.has(lower)) return undefined;
  return nome;
}

function montarDetalheAmbienteMobile(userDisplayName?: string): string | undefined {
  const nome = nomeInterlocutorMobile(userDisplayName);
  const blocoApelidos =
    "Se o usuário te chamar de «luninha», «Lu» ou outro apelido SEU, isso é vocativo para você — NÃO é o nome dele(a). " +
    "Nunca chame o usuário pelo apelido que ele usou para você, salvo pedido explícito («me chame de…»).";

  if (!nome) {
    return `App mobile Orbit. ${blocoApelidos}`;
  }

  return (
    `App mobile Orbit. O interlocutor chama-se «${nome}». ` +
    `Trate-o(a) pelo nome «${nome}» quando fizer sentido (ou use tratamento neutro). ` +
    `Você é a Luna (assistente); «${nome}» é quem conversa consigo — não inverta os nomes. ` +
    blocoApelidos
  );
}

function mapStatusHint(hint: string): "analysing" | "memory" | "writing" | null {
  const h = hint.toLowerCase();
  if (h.includes("analisar") || h.includes("inten")) return "analysing";
  if (h.includes("memória") || h.includes("memoria")) return "memory";
  if (h.includes("redigir") || h.includes("resposta")) return "writing";
  return null;
}

async function prepararChatMobile(
  message: string,
  sessionId: string | undefined,
  llm: Partial<LlmProviderSelection> | undefined,
  userDisplayName: string | undefined,
  uid: string | null | undefined,
  planId: PlanId,
) {
  const resolved = resolveLlmProviderSelection(llm, message, planId);
  const selection = resolved?.selection ?? null;
  const config = selection ? resolveLlmConfig(selection) : null;

  if (!selection || !config) {
    throw new Error(
      "Nenhum provedor LLM configurado. Define LUNA_API_KEY (Groq) e/ou CEREBRAS_API_KEY no servidor.",
    );
  }

  const isCerebras = selection.providerId === "cerebras";
  const mensagemLimit = isCerebras ? 12_000 : undefined;

  const corePath = resolveLunaCorePath();
  const core = await loadLunaCoreModule();
  const prevCwd = process.cwd();

  process.chdir(corePath);

  const mensagem = truncateMobileChatMessage(message, { maxChars: mensagemLimit });

  if (sessionId) {
    try {
      await compactarSessaoPersistida(sessionId);
    } catch {
      /* sessão opcional */
    }
  }

  const detalheAmbiente = montarDetalheAmbienteMobile(userDisplayName);
  const sidPipeline = sessionId ?? crypto.randomUUID();
  const memoria = await prepararMemoriaGlobalMobile({
    core,
    uid: uid ?? null,
    sessionId: sidPipeline,
    mensagem: message,
    maxSessoes: 3,
  });

  const usarNeuronioMemoriaLlm =
    selection.providerId === "groq" && mensagem.length < 4_000;

  const raciocinioAtivo = isCerebras;

  return {
    core,
    prevCwd,
    mensagem,
    sidPipeline,
    selection,
    config,
    resolved,
    memoria,
    usarNeuronioMemoriaLlm,
    raciocinioAtivo,
    detalheAmbiente,
  };
}

function resultadoFromPipeline(
  resultado: Awaited<ReturnType<LunaCoreModule["executarPipelineCompleto"]>>,
  sessionId: string | undefined,
  selection: LlmProviderSelection,
  resolved: ReturnType<typeof resolveLlmProviderSelection>,
): ChatMobileResult {
  const text = resultado.resposta?.texto?.trim();
  if (!text) {
    throw new Error(
      `A Luna não gerou texto. Verifica as chaves do provedor ${selection.providerId}.`,
    );
  }

  return {
    text,
    reasoning: resultado.resposta?.raciocinio?.trim() || undefined,
    sessionId: resultado.sessao?.id ?? sessionId ?? "unknown",
    turnCount: resultado.sessao?.mensagens?.length ?? 0,
    provider: selection,
    providerReason: resolved?.autoReasonLabel,
    autoMode: Boolean(resolved?.autoReason),
  };
}

export async function executarChatMobile(
  message: string,
  sessionId?: string,
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
  planId: PlanId = "free",
): Promise<ChatMobileResult> {
  const prep = await prepararChatMobile(message, sessionId, llm, userDisplayName, uid, planId);

  try {
    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "api",
      detalhe_ambiente: prep.detalheAmbiente,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      stream: false,
    });

    return resultadoFromPipeline(resultado, sessionId, prep.selection, prep.resolved);
  } finally {
    process.chdir(prep.prevCwd);
  }
}

export async function executarChatMobileStream(
  message: string,
  callbacks: ChatStreamCallbacks,
  sessionId?: string,
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
  planId: PlanId = "free",
): Promise<ChatMobileResult> {
  if (!isStreamSupported()) {
    return executarChatMobile(message, sessionId, llm, userDisplayName, uid, planId);
  }

  const prep = await prepararChatMobile(message, sessionId, llm, userDisplayName, uid, planId);

  try {
    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "api",
      detalhe_ambiente: prep.detalheAmbiente,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      stream: true,
      onStatusHint: (hint) => {
        const phase = mapStatusHint(hint);
        if (phase) callbacks.onStatus?.(phase);
      },
      onStreamReasoningDelta: callbacks.onReasoningDelta,
      onStreamContentDelta: callbacks.onContentDelta,
    });

    return resultadoFromPipeline(resultado, sessionId, prep.selection, prep.resolved);
  } finally {
    process.chdir(prep.prevCwd);
  }
}
