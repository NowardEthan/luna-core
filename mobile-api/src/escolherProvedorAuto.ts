import type { LlmProviderOption, LlmProviderSelection } from "./llmProviders.js";

export type AutoRoutingReason = "codigo" | "contexto_longo" | "documento" | "chat_rapido" | "fallback";

export const AUTO_REASON_LABELS: Record<AutoRoutingReason, string> = {
  codigo: "Pedido com código — Qwen Coder",
  contexto_longo: "Mensagem longa — Mistral",
  documento: "Documento ou anexo — Mistral",
  chat_rapido: "Conversa curta — Groq",
  fallback: "Melhor opção disponível",
};

const CODE_KEYWORDS =
  /\b(function|const|let|var|import|export|class|interface|typedef|def |async |await |npm |pnpm |yarn |git |typescript|javascript|python|rust|react|vue|angular|debug|stack\s?trace|erro:|bug:|refactor|api\.|http\.|sql|regex|componente|component|hook|useEffect|useState|\.tsx?|\.jsx?|\.py\b|\.rs\b|compil|lint|teste unit|unit test|pull request|pr\b|commit)\b/i;

function hasOption(
  available: LlmProviderOption[],
  providerId: LlmProviderSelection["providerId"],
  modelKey: LlmProviderSelection["modelKey"],
): boolean {
  return available.some((o) => o.providerId === providerId && o.modelKey === modelKey);
}

function pick(
  available: LlmProviderOption[],
  providerId: LlmProviderSelection["providerId"],
  modelKey: LlmProviderSelection["modelKey"],
): LlmProviderSelection | null {
  if (!hasOption(available, providerId, modelKey)) return null;
  return { providerId, modelKey };
}

function scoreCode(message: string): number {
  let score = 0;
  const fences = (message.match(/```/g) ?? []).length;
  if (fences >= 2) score += 4;
  if (CODE_KEYWORDS.test(message)) score += 2;

  const codeLines = message
    .split("\n")
    .filter((line) => /^\s{2,}[\w({[<]/.test(line) || /[;{}]$/.test(line.trim()));
  if (codeLines.length >= 3) score += 2;
  if (/\berro\b.*\n.*at\s+\S+:\d+/i.test(message)) score += 3;

  return score;
}

function hasAttachments(message: string): boolean {
  return (
    message.includes("[Anexos]") ||
    message.includes("Conteúdo do arquivo:") ||
    message.includes("parte omitida") ||
    message.includes("parte do arquivo omitida")
  );
}

function isLongContext(message: string): boolean {
  return message.length > 3_500;
}

/** Escolhe o melhor provedor/modelo para um turno de chat. */
export function escolherProvedorAuto(
  message: string,
  available: LlmProviderOption[],
): { selection: LlmProviderSelection; reason: AutoRoutingReason } {
  const backends = available.filter((o) => o.modelKey !== "auto");

  if (backends.length === 0) {
    return {
      selection: { providerId: "groq", modelKey: "default" },
      reason: "fallback",
    };
  }

  if (backends.length === 1) {
    const only = backends[0]!;
    return {
      selection: { providerId: only.providerId, modelKey: only.modelKey },
      reason: "fallback",
    };
  }

  const codeScore = scoreCode(message);
  if (codeScore >= 3) {
    const coder = pick(backends, "openrouter", "qwen-coder");
    if (coder) return { selection: coder, reason: "codigo" };
  }

  if (hasAttachments(message)) {
    const next = pick(backends, "openrouter", "qwen-next");
    if (next) return { selection: next, reason: "documento" };
  }

  if (isLongContext(message)) {
    const next = pick(backends, "openrouter", "qwen-next");
    if (next) return { selection: next, reason: "contexto_longo" };
  }

  const groq = pick(backends, "groq", "default");
  if (groq) return { selection: groq, reason: "chat_rapido" };

  const first = backends[0]!;
  return {
    selection: { providerId: first.providerId, modelKey: first.modelKey },
    reason: "fallback",
  };
}

export function isAutoProviderMode(input?: Partial<LlmProviderSelection>): boolean {
  return input?.providerId === "auto" || input?.modelKey === "auto";
}
