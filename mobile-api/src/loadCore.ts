import { pathToFileURL } from "node:url";

import { resolveLunaCoreEntry, resolveLunaCorePath } from "./resolveCorePath.js";
import {
  resolveLlmConfig,
  resolveLlmProviderSelection,
  type LlmProviderSelection,
} from "./llmProviders.js";
import { compactarSessaoMobile, truncateMobileChatMessage } from "./truncateForGroq.js";

export type LunaCoreModule = {
  executarPipelineCompleto: (
    mensagem: string,
    opcoes?: {
      sessaoId?: string;
      ambiente?: string;
      gerarResposta?: boolean;
      raciocinioAtivo?: boolean;
      usarNeuronioMemoriaLlm?: boolean;
      config?: import("../../src/providers/tipos.js").ConfigLuna;
    },
  ) => Promise<{
    resposta?: { texto?: string };
    sessao?: { id?: string; mensagens?: unknown[] };
    log_path: string;
  }>;
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

export async function executarChatMobile(
  message: string,
  sessionId?: string,
  llm?: Partial<LlmProviderSelection>,
): Promise<{
  text: string;
  sessionId: string;
  turnCount: number;
  provider: LlmProviderSelection;
  providerReason?: string;
  autoMode?: boolean;
}> {
  const resolved = resolveLlmProviderSelection(llm, message);
  const selection = resolved?.selection ?? null;
  const config = selection ? resolveLlmConfig(selection) : null;

  if (!selection || !config) {
    throw new Error(
      "Nenhum provedor LLM configurado. Define LUNA_API_KEY (Groq) ou OPENROUTER_API_KEY no servidor.",
    );
  }

  const useOpenRouterLongContext =
    selection.providerId === "openrouter" && selection.modelKey === "qwen-next";
  const mensagemLimit = useOpenRouterLongContext ? 14_000 : undefined;

  const corePath = resolveLunaCorePath();
  const core = await loadLunaCoreModule();
  const prevCwd = process.cwd();

  try {
    process.chdir(corePath);

    const mensagem = truncateMobileChatMessage(message, { maxChars: mensagemLimit });

    if (sessionId && selection.providerId === "groq") {
      try {
        const { obterOuCriarSessao } = await import("../../src/memoria/gerenciadorSessao.js");
        const { salvarSessao } = await import("../../src/memoria/storeSessao.js");
        const sessao = obterOuCriarSessao(sessionId);
        compactarSessaoMobile(sessao);
        salvarSessao(sessao);
      } catch {
        /* sessão opcional — não bloqueia o chat */
      }
    }

    const resultado = await core.executarPipelineCompleto(mensagem, {
      sessaoId: sessionId,
      config,
      ambiente: "api",
      gerarResposta: true,
      raciocinioAtivo: false,
      usarNeuronioMemoriaLlm: mensagem.length < 4_000,
    });

    const text = resultado.resposta?.texto?.trim();
    if (!text) {
      throw new Error(
        `A Luna não gerou texto. Verifica as chaves do provedor ${selection.providerId}.`,
      );
    }

    const sid = resultado.sessao?.id ?? sessionId ?? "unknown";
    const turnCount = resultado.sessao?.mensagens?.length ?? 0;

    return {
      text,
      sessionId: sid,
      turnCount,
      provider: selection,
      providerReason: resolved?.autoReasonLabel,
      autoMode: Boolean(resolved?.autoReason),
    };
  } finally {
    process.chdir(prevCwd);
  }
}
