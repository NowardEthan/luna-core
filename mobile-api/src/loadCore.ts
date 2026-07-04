import { pathToFileURL } from "node:url";

import { resolveLunaCoreEntry, resolveLunaCorePath } from "./resolveCorePath.js";

export type LunaCoreModule = {
  executarPipelineCompleto: (
    mensagem: string,
    opcoes?: {
      sessaoId?: string;
      ambiente?: string;
      gerarResposta?: boolean;
      raciocinioAtivo?: boolean;
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
): Promise<{ text: string; sessionId: string; turnCount: number }> {
  if (!process.env.LUNA_API_KEY?.trim()) {
    throw new Error(
      "LUNA_API_KEY não configurada no Railway. Vai a Variables e adiciona a chave Groq.",
    );
  }

  const corePath = resolveLunaCorePath();
  const core = await loadLunaCoreModule();
  const prevCwd = process.cwd();

  try {
    process.chdir(corePath);
    const resultado = await core.executarPipelineCompleto(message, {
      sessaoId: sessionId,
      ambiente: "api",
      gerarResposta: true,
      raciocinioAtivo: true,
    });

    const text = resultado.resposta?.texto?.trim();
    if (!text) {
      throw new Error(
        "A Luna não gerou texto. Verifica LUNA_API_KEY e os modelos Groq nas Variables do Railway.",
      );
    }

    const sid = resultado.sessao?.id ?? sessionId ?? "unknown";
    const turnCount = resultado.sessao?.mensagens?.length ?? 0;

    return { text, sessionId: sid, turnCount };
  } finally {
    process.chdir(prevCwd);
  }
}
