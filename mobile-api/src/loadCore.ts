import { pathToFileURL } from "node:url";

import { prepararMemoriaGlobalMobile } from "./crossSessionContext.js";
import { resolveLunaCoreEntry, resolveLunaCorePath } from "./resolveCorePath.js";
import {
  resolveLlmConfig,
  resolveLlmProviderSelection,
  type ConfigLuna,
  type LlmProviderSelection,
} from "./llmProviders.js";
import { compactarSessaoPersistida } from "./sessaoMobile.js";
import { truncateMobileChatMessage } from "./truncateForGroq.js";

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
    },
  ) => Promise<{
    resposta?: { texto?: string };
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

function montarDetalheAmbienteMobile(userDisplayName?: string): string | undefined {
  const nome = userDisplayName?.trim();
  if (!nome) return undefined;
  const lower = nome.toLowerCase();
  if (lower === "luna" || lower === "você" || lower === "voce") return undefined;
  return (
    `App mobile Orbit. O interlocutor chama-se «${nome}». ` +
    `Trate-o(a) pelo nome «${nome}» quando fizer sentido. ` +
    `Você é a Luna (assistente); «${nome}» é quem conversa consigo — não inverta os nomes.`
  );
}

export async function executarChatMobile(
  message: string,
  sessionId?: string,
  llm?: Partial<LlmProviderSelection>,
  userDisplayName?: string,
  uid?: string | null,
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
      "Nenhum provedor LLM configurado. Define LUNA_API_KEY (Groq) e/ou CEREBRAS_API_KEY no servidor.",
    );
  }

  const isCerebras = selection.providerId === "cerebras";
  const mensagemLimit = isCerebras ? 12_000 : undefined;

  const corePath = resolveLunaCorePath();
  const core = await loadLunaCoreModule();
  const prevCwd = process.cwd();

  try {
    process.chdir(corePath);

    const mensagem = truncateMobileChatMessage(message, { maxChars: mensagemLimit });

    if (sessionId) {
      try {
        await compactarSessaoPersistida(sessionId);
      } catch {
        /* sessão opcional — não bloqueia o chat */
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

    const resultado = await core.executarPipelineCompleto(mensagem, {
      sessaoId: sidPipeline,
      config,
      ambiente: "api",
      detalhe_ambiente: detalheAmbiente,
      gerarResposta: true,
      raciocinioAtivo: false,
      usarNeuronioMemoriaLlm,
      contexto_cross_sessao: memoria.contextoCrossSessao,
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
