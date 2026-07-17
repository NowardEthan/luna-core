import { pathToFileURL } from "node:url";

import { prepararMemoriaGlobalMobile } from "./crossSessionContext.js";
import { resolveLunaCoreEntry, resolveLunaCorePath } from "./resolveCorePath.js";
import {
  isStreamSupported,
  listConfiguredProviderOptions,
  resolveLlmConfig,
  resolveLlmProviderSelection,
  type ConfigLuna,
  type LlmProviderSelection,
} from "./llmProviders.js";
import type { PlanId } from "./billing/planMapping.js";
import { compactarSessaoPersistida } from "./sessaoMobile.js";
import { MAX_ATTACHMENT_TEXT_IN_CHAT_DEEP, truncateMobileChatMessage } from "./truncateForGroq.js";
import { sanitizarInterlocutorPipeline } from "../../dist/interlocutor/validadorInterlocutor.js";
import {
  deveUsarPersistenciaFirestore,
  executarComPersistenciaFirestore,
} from "./persistenciaFirestore.js";
import { carregarAnexosVisuaisRecentes } from "./firestoreChat.js";
import { getAdminFirestore } from "./firebaseAdmin.js";
import { lerRotina, lerRegistosRotina, lerRotinaSets, maosDaRotina } from "./rotinaFirestore.js";
import { blocosDaRotinaVigente, hojeISOnoFuso } from "../../dist/estado/neuronioRotina.js";
import { carregarDocumentos } from "./carregarDocumentos.js";

export type ChatStreamCallbacks = {
  onStatus?: (phase: "analysing" | "memory" | "writing") => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  onAcao?: (acao: {
    tipo: "inicio_ferramenta" | "fim_ferramenta";
    ferramenta: string;
    argumentos: Record<string, unknown>;
    rodada: number;
    maxRodadas: number;
    sucesso?: boolean;
    fontes?: Array<{ title?: string; url: string }>;
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
  /** URL no Storage — preferida: sem teto de tamanho e o payload fica leve. */
  url?: string;
  /** Alternativa sem nuvem. */
  imageBase64?: string;
};

/** Documento do turno — só a URL: o texto é extraído aqui e lido por partes (`ler_arquivo`). */
export type ChatDocumentInput = {
  id: string;
  name?: string;
  mimeType?: string;
  url: string;
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
      raciocinioEffort?: "low" | "medium" | "high";
      usarNeuronioMemoriaLlm?: boolean;
      contexto_cross_sessao?: string[];
      interlocutor?: { uid: string; criador_verificado: boolean; display_name?: string };
      config?: ConfigLuna;
      stream?: boolean;
      timeZone?: string;
      /** A rotina dele — os blocos recorrentes. É o que a faz saber onde ele está. */
      rotina?: Array<{
        id: string;
        titulo: string;
        dias: number[];
        inicio: number;
        fim: number;
        nota?: string;
        origem?: "ethan" | "luna";
      }>;
      rotina_registos?: Array<{
        blocoId: string;
        dia: string;
        estado: "feito" | "hoje_nao" | "ignorado";
      }>;
      rotinaDeps?: {
        ler: () => Promise<
          Array<{ id: string; titulo: string; dias: number[]; inicio: number; fim: number; nota?: string; origem?: "ethan" | "luna" }>
        >;
        criar: (b: {
          titulo: string;
          dias: number[];
          inicio: number;
          fim: number;
          nota?: string;
          notificar: boolean;
        }) => Promise<string>;
        editar: (
          id: string,
          campos: Partial<{
            titulo: string;
            dias: number[];
            inicio: number;
            fim: number;
            nota?: string;
            notificar: boolean;
          }>,
        ) => Promise<void>;
        apagar: (id: string) => Promise<void>;
        adicionarExtra?: (id: string, tarefas: Array<{ id: string; texto: string; feito: boolean; hora?: number; notificar?: boolean }>) => Promise<void>;
      };
      onStatusHint?: (hint: string) => void;
      onStreamReasoningDelta?: (delta: string) => void;
      onStreamContentDelta?: (delta: string) => void;
      anexosImagem?: Array<{
        id: string;
        nome?: string;
        mimeType?: string;
        /** URL no Storage (preferida) ou base64 (sem nuvem). */
        url?: string;
        imageBase64?: string;
        /** Anexo de um turno anterior — disponível, mas não força o modo agêntico. */
        deTurnoAnterior?: boolean;
      }>;
      /** Documentos com o texto já extraído — lidos por partes via `ler_arquivo`. */
      anexosDocumento?: Array<{
        id: string;
        nome?: string;
        mimeType?: string;
        texto: string;
        paginas?: number;
      }>;
      onAcaoAgentico?: (acao: {
        tipo: "inicio_ferramenta" | "fim_ferramenta";
        ferramenta: string;
        argumentos: Record<string, unknown>;
        rodada: number;
        maxRodadas: number;
        sucesso?: boolean;
        fontes?: Array<{ title?: string; url: string }>;
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
  // O retorno real é uma MemoriaSessao; tipar ao menos `mensagens` mantém este
  // tipo compatível com LunaCoreCross (crossSessionContext), senão o build quebra
  // ao passar `core` para funções que esperam LunaCoreCross (TS2322).
  prepararSessaoOrbit: (sessaoId: string) => { mensagens: unknown[] };
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

function isCerebrasConfig(config: ConfigLuna): boolean {
  return config.baseUrl.toLowerCase().includes("cerebras.ai");
}

function isOpenrouterConfig(config: ConfigLuna): boolean {
  return config.baseUrl.toLowerCase().includes("openrouter.ai");
}

async function prepararChatMobile(
  message: string,
  sessionId: string | undefined,
  attachments: ChatAttachmentInput[] | undefined,
  llm: Partial<LlmProviderSelection> | undefined,
  userDisplayName: string | undefined,
  uid: string | null | undefined,
  planId: PlanId,
  timeZone?: string,
  reasoningEnabled?: boolean,
  reasoningEffort?: "low" | "medium" | "high",
  documents?: ChatDocumentInput[],
) {
  const resolved = resolveLlmProviderSelection(llm, message, planId);
  const selection = resolved?.selection ?? null;
  const config = selection ? resolveLlmConfig(selection) : null;

  if (!selection || !config) {
    const temOpenrouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const temCerebras = Boolean(process.env.CEREBRAS_API_KEY?.trim());
    const temGroq = Boolean(
      process.env.LUNA_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim(),
    );
    if (!temOpenrouter && !temCerebras && !temGroq) {
      throw new Error(
        "Nenhum provedor LLM configurado. Define OPENROUTER_API_KEY, CEREBRAS_API_KEY e/ou LUNA_API_KEY (Groq) no servidor.",
      );
    }
    throw new Error(
      "Não foi possível escolher um modelo para este plano. Verifica OPENROUTER_API_KEY (Core), CEREBRAS_API_KEY (Core) ou LUNA_API_KEY (Pulse) no Railway.",
    );
  }

  const isCerebras = selection.providerId === "cerebras" || isCerebrasConfig(config);
  const isOpenrouter = isOpenrouterConfig(config);
  const isDeepProvider = isCerebras || isOpenrouter;
  // Cerebras/OpenRouter (DeepSeek) têm janela de contexto grande — deixa ler documentos quase inteiros.
  const mensagemLimit = isDeepProvider ? 120_000 : undefined;
  const anexoLimit = isDeepProvider ? MAX_ATTACHMENT_TEXT_IN_CHAT_DEEP : undefined;

  const corePath = resolveLunaCorePath();
  const core = await loadLunaCoreModule();
  const prevCwd = process.cwd();

  process.chdir(corePath);

  const mensagem = truncateMobileChatMessage(message, {
    maxChars: mensagemLimit,
    maxAttachmentChars: anexoLimit,
  });

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

  const raciocinioSuportado = isCerebras || isOpenrouter;
  const raciocinioAtivo = reasoningEnabled !== false && raciocinioSuportado;
  const anexosDoTurno = (attachments ?? []).map((att, index) => ({
    id: att.id?.trim() || `img-${index + 1}`,
    nome: att.name?.trim() || undefined,
    mimeType: att.mimeType?.trim() || "image/jpeg",
    url: att.url?.trim() || undefined,
    imageBase64: att.imageBase64?.trim() || undefined,
  }));

  // Anexos de turnos anteriores: ela pode voltar numa foto antiga da conversa
  // ("aquela foto que te mandei"). Só entram os que já estão no Storage — e só os
  // metadados vão no prompt; o arquivo só é buscado se ela decidir olhar.
  const idsDoTurno = new Set(anexosDoTurno.map((a) => a.id));
  const anteriores = uid
    ? (await carregarAnexosVisuaisRecentes(uid, sidPipeline))
        .filter((a) => !idsDoTurno.has(a.id))
        .map((a) => ({
          id: a.id,
          nome: a.name,
          mimeType: a.mimeType,
          url: a.url,
          deTurnoAnterior: true,
        }))
    : [];

  const anexosImagem = [...anexosDoTurno, ...anteriores];

  // Documentos: o app manda só a URL; aqui buscamos e extraímos o texto (com cache). Ele
  // NÃO entra no prompt — fica à disposição do `ler_arquivo`, para ela ler por partes.
  const anexosDocumento = await carregarDocumentos(documents);

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
    raciocinioEffort: reasoningEffort,
    detalheAmbiente,
    interlocutor,
    anexosImagem,
    anexosDocumento,
    timeZone,
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

function erroDeProvedorRecuperavel(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const texto = mensagem.toLowerCase();
  return (
    texto.includes("402") ||
    texto.includes("429") ||
    texto.includes("500") ||
    texto.includes("503") ||
    texto.includes("rate limit") ||
    texto.includes("limit exceeded") ||
    texto.includes("payment") ||
    texto.includes("credits") ||
    texto.includes("limite de pedidos") ||
    texto.includes("indisponível") ||
    texto.includes("indisponivel") ||
    texto.includes("timeout")
  );
}

function listarFallbackSelections(
  atual: LlmProviderSelection,
  planId: PlanId,
): LlmProviderSelection[] {
  const todos = listConfiguredProviderOptions();
  // Ordem preferida de fallback: OpenRouter -> Cerebras (GLM) -> Cerebras (GPT-OSS) -> Groq
  const ordem: LlmProviderSelection[] = [
    { providerId: "openrouter", modelKey: "default" },
    { providerId: "cerebras", modelKey: "glm-47" },
    { providerId: "cerebras", modelKey: "gpt-oss-120b" },
    { providerId: "groq", modelKey: "default" },
  ];
  return ordem
    .filter(
      (sel) =>
        sel.providerId !== atual.providerId || sel.modelKey !== atual.modelKey,
    )
    .filter((sel) => todos.some((o) => o.providerId === sel.providerId && o.modelKey === sel.modelKey));
}

export async function executarChatMobile(
  message: string,
  sessionId?: string,
  attachments?: ChatAttachmentInput[],
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
  planId: PlanId = "free",
  timeZone?: string,
  reasoningEnabled?: boolean,
  reasoningEffort?: "low" | "medium" | "high",
  documents?: ChatDocumentInput[],
): Promise<ChatMobileResult> {
  const prep = await prepararChatMobile(
    message,
    sessionId,
    attachments,
    llm,
    userDisplayName,
    uid,
    planId,
    timeZone,
    reasoningEnabled,
    reasoningEffort,
    documents,
  );

  const rodarPipeline = async () => {
    // A rotina dele — é o que a faz saber que ele está no ônibus, e não só que são 8h40.
    // Falhar aqui não pode derrubar a conversa: sem rotina, ela continua a saber as horas.
    const db = getAdminFirestore();
    // Só a rotina que VIGORA hoje: de férias, a Luna vê a rotina de férias — não o trabalho.
    // Sem isto, ela via todos os blocos misturados e cobrava o que estava «desligado».
    const rotinaCrua = uid && db ? await lerRotina(db, uid) : [];
    const rotinaSets = uid && db ? await lerRotinaSets(db, uid) : [];
    const rotina = blocosDaRotinaVigente(rotinaCrua, rotinaSets, hojeISOnoFuso(timeZone));
    const rotinaRegistos = uid && db && rotina.length ? await lerRegistosRotina(db, uid) : [];

    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "orbit_mobile",
      detalhe_ambiente: prep.detalheAmbiente,
      interlocutor: prep.interlocutor,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      raciocinioEffort: prep.raciocinioEffort,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      anexosImagem: prep.anexosImagem,
      anexosDocumento: prep.anexosDocumento,
      rotina,
      rotina_registos: rotinaRegistos,
      // As mãos dela: sem isto, «monta-me a semana» só podia ser encenado.
      rotinaDeps: uid && db ? maosDaRotina(db, uid, prep.timeZone) : undefined,
      stream: false,
      timeZone: prep.timeZone,
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
  timeZone?: string,
  reasoningEnabled?: boolean,
  reasoningEffort?: "low" | "medium" | "high",
  documents?: ChatDocumentInput[],
): Promise<ChatMobileResult> {
  if (!isStreamSupported()) {
    return executarChatMobile(
      message,
      sessionId,
      attachments,
      llm,
      userDisplayName,
      uid,
      planId,
      timeZone,
      reasoningEnabled,
      reasoningEffort,
      documents,
    );
  }

  const prep = await prepararChatMobile(
    message,
    sessionId,
    attachments,
    llm,
    userDisplayName,
    uid,
    planId,
    timeZone,
    reasoningEnabled,
    reasoningEffort,
    documents,
  );

  const rodarPipeline = async () => {
    // ── A rotina TAMBÉM aqui ────────────────────────────────────────────────────
    //
    // Há DOIS caminhos de resposta: este (streaming, o que o app usa de facto) e o normal.
    // Liguei a rotina só no outro, e o resultado apareceu em campo na primeira tentativa do
    // Ethan: ela respondeu-lhe «o módulo de rotina não tá disponível aqui nesse ambiente» —
    // que é, à letra, a minha própria mensagem de erro para quando as mãos não chegam.
    //
    // Ela TENTOU. Não tinha mão. E eu tinha-lhe dito que estava tudo no ar.
    //
    // A lição não é «esqueci uma linha»: é que testei o pipeline pelo caminho que EU chamo
    // nas sondas, e não pelo caminho que o APP chama. Uma sonda que não passa por onde o
    // utilizador passa mede outra coisa.
    const db = getAdminFirestore();
    // Só a rotina que VIGORA hoje: de férias, a Luna vê a rotina de férias — não o trabalho.
    // Sem isto, ela via todos os blocos misturados e cobrava o que estava «desligado».
    const rotinaCrua = uid && db ? await lerRotina(db, uid) : [];
    const rotinaSets = uid && db ? await lerRotinaSets(db, uid) : [];
    const rotina = blocosDaRotinaVigente(rotinaCrua, rotinaSets, hojeISOnoFuso(timeZone));
    const rotinaRegistos = uid && db && rotina.length ? await lerRegistosRotina(db, uid) : [];

    const resultado = await prep.core.executarPipelineCompleto(prep.mensagem, {
      sessaoId: prep.sidPipeline,
      config: prep.config,
      ambiente: "orbit_mobile",
      detalhe_ambiente: prep.detalheAmbiente,
      interlocutor: prep.interlocutor,
      gerarResposta: true,
      raciocinioAtivo: prep.raciocinioAtivo,
      raciocinioEffort: prep.raciocinioEffort,
      usarNeuronioMemoriaLlm: prep.usarNeuronioMemoriaLlm,
      contexto_cross_sessao: prep.memoria.contextoCrossSessao,
      anexosImagem: prep.anexosImagem,
      anexosDocumento: prep.anexosDocumento,
      rotina,
      rotina_registos: rotinaRegistos,
      rotinaDeps: uid && db ? maosDaRotina(db, uid, prep.timeZone) : undefined,
      stream: true,
      timeZone: prep.timeZone,
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
