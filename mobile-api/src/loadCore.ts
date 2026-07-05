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
import { sanitizarInterlocutorPipeline } from "../../dist/interlocutor/validadorInterlocutor.js";
import {
  deveUsarPersistenciaFirestore,
  executarComPersistenciaFirestore,
} from "./persistenciaFirestore.js";

export type ChatStreamCallbacks = {
  onStatus?: (phase: "analysing" | "memory" | "writing") => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  onAcao?: (acao: {
    tipo: "inicio_ferramenta" | "fim_ferramenta";
    ferramenta: string;
    argumentos: Record<string, unknown>;
    rodada: number;
    sucesso?: boolean;
  }) => void;
};

export type ChatMobileResult = {
  text: string;
  reasoning?: string;
  sessionId: string;
  turnCount: number;
  provider: LlmProviderSelection;
  providerReason?: string;
  autoMode?: boolean;
  humor_atual?: {
    emoji: string;
    label: string;
    tema: string;
    narrativa?: string;
    accessibilityLabel: string;
  };
};

export type ChatAttachmentInput = {
  id?: string;
  name?: string;
  mimeType?: string;
  imageBase64: string;
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
      interlocutor?: { uid: string; criador_verificado: boolean; display_name?: string };
      config?: ConfigLuna;
      stream?: boolean;
      onStatusHint?: (hint: string) => void;
      onStreamReasoningDelta?: (delta: string) => void;
      onStreamContentDelta?: (delta: string) => void;
      anexosImagem?: Array<{
        id: string;
        nome?: string;
        mimeType?: string;
        imageBase64: string;
      }>;
      onAcaoAgentico?: (acao: {
        tipo: "inicio_ferramenta" | "fim_ferramenta";
        ferramenta: string;
        argumentos: Record<string, unknown>;
        rodada: number;
        sucesso?: boolean;
      }) => void;
    },
  ) => Promise<{
    resposta?: { texto?: string; raciocinio?: string };
    sessao?: { id?: string; mensagens?: unknown[] };
    humor_atual?: {
      emoji: string;
      label: string;
      tema: string;
      narrativa?: string;
      accessibilityLabel: string;
    };
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

function montarDetalheAmbienteMobile(
  userDisplayName?: string,
  criadorVerificado?: boolean,
): string | undefined {
  const nome = nomeInterlocutorMobile(userDisplayName);
  const blocoApelidos =
    "Se o usuário te chamar de «luninha», «Lu» ou outro apelido SEU, isso é vocativo para você — NÃO é o nome dele(a). " +
    "Nunca chame o usuário pelo apelido que ele usou para você, salvo pedido explícito («me chame de…»).";

  const blocoEthan = criadorVerificado
    ? "Interlocutor: Ethan, criador verificado. Trate-o com proximidade canónica de vínculo — sem tom de assistente corporativa. "
    : "";

  if (!nome) {
    return `${blocoEthan}${blocoApelidos}`.trim() || undefined;
  }

  return (
    blocoEthan +
    `O interlocutor chama-se «${nome}». ` +
    `Trate-o(a) pelo nome «${nome}» quando fizer sentido (ou use tratamento neutro). ` +
    `Você é a Luna; «${nome}» é quem conversa consigo — não inverta os nomes. ` +
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
  attachments: ChatAttachmentInput[] | undefined,
  llm: Partial<LlmProviderSelection> | undefined,
  userDisplayName: string | undefined,
  uid: string | null | undefined,
  planId: PlanId,
) {
  const resolved = resolveLlmProviderSelection(llm, message, planId);
  const selection = resolved?.selection ?? null;
  const config = selection ? resolveLlmConfig(selection) : null;

  if (!selection || !config) {
    const temCerebras = Boolean(process.env.CEREBRAS_API_KEY?.trim());
    const temGroq = Boolean(
      process.env.LUNA_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim(),
    );
    if (!temCerebras && !temGroq) {
      throw new Error(
        "Nenhum provedor LLM configurado. Define CEREBRAS_API_KEY e/ou LUNA_API_KEY (Groq) no servidor.",
      );
    }
    throw new Error(
      "Não foi possível escolher um modelo para este plano. Verifica CEREBRAS_API_KEY (Core) ou LUNA_API_KEY (Pulse) no Railway.",
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

  const interlocutor = sanitizarInterlocutorPipeline(
    uid != null
      ? {
          uid,
          display_name: userDisplayName,
        }
      : undefined,
  );
  const sidPipeline = sessionId ?? crypto.randomUUID();
  const detalheAmbiente = montarDetalheAmbienteMobile(
    userDisplayName,
    interlocutor?.criador_verificado,
  );
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
  const anexosImagem = (attachments ?? []).map((att, index) => ({
    id: att.id?.trim() || `img-${index + 1}`,
    nome: att.name?.trim() || undefined,
    mimeType: att.mimeType?.trim() || "image/jpeg",
    imageBase64: att.imageBase64.trim(),
  }));

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
    interlocutor,
    anexosImagem,
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
    humor_atual: resultado.humor_atual,
  };
}

export async function executarChatMobile(
  message: string,
  sessionId?: string,
  attachments?: ChatAttachmentInput[],
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
  planId: PlanId = "free",
): Promise<ChatMobileResult> {
  const prep = await prepararChatMobile(message, sessionId, attachments, llm, userDisplayName, uid, planId);

  const rodarPipeline = async () => {
    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "orbit_mobile",
      detalhe_ambiente: prep.detalheAmbiente,
      interlocutor: prep.interlocutor,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      anexosImagem: prep.anexosImagem,
      stream: false,
    });
    return resultadoFromPipeline(resultado, sessionId, prep.selection, prep.resolved);
  };

  try {
    if (deveUsarPersistenciaFirestore() && uid) {
      return await executarComPersistenciaFirestore(uid, rodarPipeline);
    }
    return await rodarPipeline();
  } finally {
    process.chdir(prep.prevCwd);
  }
}

export async function executarChatMobileStream(
  message: string,
  callbacks: ChatStreamCallbacks,
  sessionId?: string,
  attachments?: ChatAttachmentInput[],
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
  planId: PlanId = "free",
): Promise<ChatMobileResult> {
  if (!isStreamSupported()) {
    return executarChatMobile(message, sessionId, attachments, llm, userDisplayName, uid, planId);
  }

  const prep = await prepararChatMobile(message, sessionId, attachments, llm, userDisplayName, uid, planId);

  const rodarPipeline = async () => {
    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "orbit_mobile",
      detalhe_ambiente: prep.detalheAmbiente,
      interlocutor: prep.interlocutor,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      anexosImagem: prep.anexosImagem,
      stream: true,
      onStatusHint: (hint) => {
        const phase = mapStatusHint(hint);
        if (phase) callbacks.onStatus?.(phase);
      },
      onStreamReasoningDelta: callbacks.onReasoningDelta,
      onStreamContentDelta: callbacks.onContentDelta,
      onAcaoAgentico: callbacks.onAcao,
    });
    return resultadoFromPipeline(resultado, sessionId, prep.selection, prep.resolved);
  };

  try {
    if (deveUsarPersistenciaFirestore() && uid) {
      return await executarComPersistenciaFirestore(uid, rodarPipeline);
    }
    return await rodarPipeline();
  } finally {
    process.chdir(prep.prevCwd);
  }
}
