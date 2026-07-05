import type { LlmProviderOption, LlmProviderSelection } from "./llmProviders.js";

import {
  AUTO_ROUTING_BRAND_LABELS,
  FREE_PLAN_BRAND_NOTICE,
} from "./modelBrands.js";

export type AutoRoutingReason =
  | "codigo"
  | "contexto_longo"
  | "documento"
  | "chat_rapido"
  | "fallback";

/** Labels de roteamento automático — nomes Luna (não expõe provider). */
export const AUTO_REASON_LABELS: Record<AutoRoutingReason, string> = {
  codigo: AUTO_ROUTING_BRAND_LABELS.codigo,
  contexto_longo: AUTO_ROUTING_BRAND_LABELS.contexto_longo,
  documento: AUTO_ROUTING_BRAND_LABELS.documento,
  chat_rapido: AUTO_ROUTING_BRAND_LABELS.chat_rapido,
  fallback: AUTO_ROUTING_BRAND_LABELS.fallback_core,
};

export { FREE_PLAN_BRAND_NOTICE as FREE_PLAN_MODEL_NOTICE };

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

/** Escolhe GLM 4.7 por padrão; Groq só se Cerebras indisponível. */
export function escolherProvedorAuto(
  message: string,
  available: LlmProviderOption[],
): { selection: LlmProviderSelection; reason: AutoRoutingReason } {
  const backends = available.filter((o) => o.modelKey !== "auto");

  if (backends.length === 0) {
    return {
      selection: { providerId: "cerebras", modelKey: "glm-47" },
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

  const glm = pick(backends, "cerebras", "glm-47");

  if (scoreCode(message) >= 3 && glm) {
    return { selection: glm, reason: "codigo" };
  }

  if (hasAttachments(message) && glm) {
    return { selection: glm, reason: "documento" };
  }

  if (isLongContext(message) && glm) {
    return { selection: glm, reason: "contexto_longo" };
  }

  if (glm) return { selection: glm, reason: "chat_rapido" };

  const groq = pick(backends, "groq", "default");
  if (groq) return { selection: groq, reason: "fallback" };

  const first = backends[0]!;
  return {
    selection: { providerId: first.providerId, modelKey: first.modelKey },
    reason: "fallback",
  };
}

export function isAutoProviderMode(input?: Partial<LlmProviderSelection>): boolean {
  return input?.providerId === "auto" || input?.modelKey === "auto";
}
