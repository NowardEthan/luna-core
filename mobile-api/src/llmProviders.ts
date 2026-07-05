import {
  AUTO_REASON_LABELS,
  escolherProvedorAuto,
  isAutoProviderMode,
  type AutoRoutingReason,
} from "./escolherProvedorAuto.js";
import type { PlanId } from "./billing/planMapping.js";
import {
  clampProviderSelectionForPlan,
  filterProviderOptionsForPlan,
  FREE_PLAN_MODEL_NOTICE,
  isGlm47Provider,
  isPremiumModelAllowed,
} from "./billing/planModelPolicy.js";

type ConfigLuna = {
  apiKey: string;
  baseUrl: string;
  modeloMenor: string;
  modeloMaior: string;
  temperaturaMenor: number;
  temperaturaMaior: number;
  apiKeyMenor?: string;
  baseUrlMenor?: string;
};

export type { ConfigLuna };

export type LlmProviderId = "groq" | "cerebras" | "auto";

export type LlmModelKey = "default" | "glm-47" | "auto";

export type LlmProviderSelection = {
  providerId: LlmProviderId;
  modelKey: LlmModelKey;
};

export type LlmProviderOption = {
  providerId: LlmProviderId;
  modelKey: LlmModelKey;
  label: string;
  description: string;
  modelId: string;
  configured: boolean;
};

const CEREBRAS_BASE = "https://api.cerebras.ai/v1";

const GROQ_DEFAULT = {
  label: "Groq · GPT-OSS 120B",
  description: "Rápido; ideal para conversas do dia a dia.",
  modelId: "openai/gpt-oss-120b",
};

const CEREBRAS_GLM_47 = {
  label: "Cerebras · Z.ai GLM 4.7",
  description: "355B — raciocínio forte, ~1000 tok/s no tier free.",
  modelId: "zai-glm-4.7",
};

type CatalogProviderId = Exclude<LlmProviderId, "auto">;
type CatalogModelKey = Exclude<LlmModelKey, "auto">;

const MODELS: Record<
  CatalogProviderId,
  Partial<Record<CatalogModelKey, { label: string; description: string; modelId: string }>>
> = {
  groq: {
    default: GROQ_DEFAULT,
  },
  cerebras: {
    "glm-47": CEREBRAS_GLM_47,
  },
};

function groqApiKey(): string | undefined {
  return process.env.LUNA_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || undefined;
}

function cerebrasApiKey(): string | undefined {
  return process.env.CEREBRAS_API_KEY?.trim() || undefined;
}

function isProviderConfigured(providerId: CatalogProviderId): boolean {
  if (providerId === "groq") return Boolean(groqApiKey());
  return Boolean(cerebrasApiKey());
}

function resolveCerebrasModelId(): string {
  return process.env.CEREBRAS_MODEL?.trim() || CEREBRAS_GLM_47.modelId;
}

function groqMenorModelId(): string {
  return process.env.LUNA_MODELO_MENOR?.trim() || "llama-3.1-8b-instant";
}

function groqMaiorModelId(): string {
  return process.env.LUNA_MODELO_MAIOR?.trim() || GROQ_DEFAULT.modelId;
}

/** Normaliza pedidos legados (OpenRouter / qwen) para Cerebras GLM ou Groq. */
export function normalizeLegacyProviderSelection(
  input?: Partial<{ providerId?: string; modelKey?: string }>,
  planId: PlanId = "free",
): Partial<LlmProviderSelection> | undefined {
  if (!input) return input;

  const providerId = input.providerId;
  const modelKey = input.modelKey;

  if (providerId === "openrouter" || modelKey === "qwen-next" || modelKey === "qwen-coder") {
    if (isPremiumModelAllowed(planId) && isProviderConfigured("cerebras")) {
      return { providerId: "cerebras", modelKey: "glm-47" };
    }
    return { providerId: "groq", modelKey: "default" };
  }

  if (providerId === "cerebras" && (modelKey === "glm-47" || modelKey === "default" || !modelKey)) {
    if (!isPremiumModelAllowed(planId)) {
      return { providerId: "groq", modelKey: "default" };
    }
    return { providerId: "cerebras", modelKey: "glm-47" };
  }

  if (providerId === "groq" || providerId === "auto") {
    return {
      providerId: providerId as LlmProviderId,
      modelKey: (modelKey === "auto" ? "auto" : "default") as LlmModelKey,
    };
  }

  return input as Partial<LlmProviderSelection>;
}

/** Opções expostas ao mobile (Cerebras primeiro — default). */
export function listConfiguredProviderOptions(): LlmProviderOption[] {
  const options: LlmProviderOption[] = [];

  if (isProviderConfigured("cerebras") && MODELS.cerebras["glm-47"]) {
    const m = MODELS.cerebras["glm-47"]!;
    options.push({
      providerId: "cerebras",
      modelKey: "glm-47",
      label: m.label,
      description: m.description,
      modelId: resolveCerebrasModelId(),
      configured: true,
    });
  }

  if (isProviderConfigured("groq") && MODELS.groq.default) {
    options.push({
      providerId: "groq",
      modelKey: "default",
      label: GROQ_DEFAULT.label,
      description: GROQ_DEFAULT.description,
      modelId: groqMaiorModelId(),
      configured: true,
    });
  }

  return options;
}

function preferDefaultProvider(
  available: LlmProviderOption[],
  planId: PlanId = "free",
): LlmProviderSelection {
  if (isPremiumModelAllowed(planId)) {
    const cerebras = available.find((o) => o.providerId === "cerebras" && o.modelKey === "glm-47");
    if (cerebras) {
      return { providerId: cerebras.providerId, modelKey: cerebras.modelKey };
    }
  }
  const groq = available.find((o) => o.providerId === "groq" && o.modelKey === "default");
  if (groq) {
    return { providerId: groq.providerId, modelKey: groq.modelKey };
  }
  const first = available[0]!;
  return { providerId: first.providerId, modelKey: first.modelKey };
}

/** Opções para UI — inclui automático quando há Groq + Cerebras. */
export function listProviderOptionsForUi(planId: PlanId = "free"): LlmProviderOption[] {
  const configured = filterProviderOptionsForPlan(planId, listConfiguredProviderOptions());
  if (configured.length <= 1) return configured;

  const autoDescription = isPremiumModelAllowed(planId)
    ? "GLM 4.7 por padrão; Groq para respostas mais rápidas quando escolhido."
    : "Groq por padrão no plano Grátis. GLM 4.7 no Plus.";

  return [
    {
      providerId: "auto",
      modelKey: "auto",
      label: "Automático",
      description: autoDescription,
      modelId: "auto",
      configured: true,
    },
    ...configured,
  ];
}

export type ResolvedLlmProvider = {
  selection: LlmProviderSelection;
  autoReason?: AutoRoutingReason;
  autoReasonLabel?: string;
};

export function isAnyLlmProviderConfigured(): boolean {
  return listConfiguredProviderOptions().length > 0;
}

export function resolveLlmProviderSelection(
  input?: Partial<LlmProviderSelection> & Partial<{ providerId?: string; modelKey?: string }>,
  message?: string,
  planId: PlanId = "free",
): ResolvedLlmProvider | null {
  const available = filterProviderOptionsForPlan(planId, listConfiguredProviderOptions());
  if (available.length === 0) return null;

  const requestedGlm = isGlm47Provider(input?.providerId, input?.modelKey);
  const normalized = normalizeLegacyProviderSelection(input, planId) ?? input;

  if (isAutoProviderMode(normalized)) {
    if (!message?.trim()) {
      const selection = clampProviderSelectionForPlan(
        planId,
        preferDefaultProvider(available, planId),
      );
      return {
        selection,
        autoReason: "fallback",
        autoReasonLabel: isPremiumModelAllowed(planId)
          ? AUTO_REASON_LABELS.fallback
          : FREE_PLAN_MODEL_NOTICE,
      };
    }
    const routed = escolherProvedorAuto(message, available);
    const selection = clampProviderSelectionForPlan(planId, routed.selection);
    const downgraded = !isPremiumModelAllowed(planId) && isGlm47Provider(routed.selection.providerId, routed.selection.modelKey);
    return {
      selection,
      autoReason: routed.reason,
      autoReasonLabel: downgraded ? FREE_PLAN_MODEL_NOTICE : AUTO_REASON_LABELS[routed.reason],
    };
  }

  const requestedProvider = normalized?.providerId;
  const requestedModel = normalized?.modelKey;

  if (requestedProvider && requestedModel) {
    const match = available.find(
      (o) => o.providerId === requestedProvider && o.modelKey === requestedModel,
    );
    if (match) {
      const selection = clampProviderSelectionForPlan(planId, {
        providerId: match.providerId,
        modelKey: match.modelKey,
      });
      return {
        selection,
        ...(requestedGlm && !isPremiumModelAllowed(planId)
          ? { autoReasonLabel: FREE_PLAN_MODEL_NOTICE }
          : {}),
      };
    }
  }

  if (requestedProvider && requestedProvider !== "auto") {
    const match = available.find((o) => o.providerId === requestedProvider);
    if (match) {
      const selection = clampProviderSelectionForPlan(planId, {
        providerId: match.providerId,
        modelKey: match.modelKey,
      });
      return {
        selection,
        ...(requestedGlm && !isPremiumModelAllowed(planId)
          ? { autoReasonLabel: FREE_PLAN_MODEL_NOTICE }
          : {}),
      };
    }
  }

  const selection = clampProviderSelectionForPlan(planId, preferDefaultProvider(available, planId));
  return {
    selection,
    ...(requestedGlm && !isPremiumModelAllowed(planId)
      ? { autoReasonLabel: FREE_PLAN_MODEL_NOTICE }
      : {}),
  };
}

function attachGroqAuxiliar(config: ConfigLuna): ConfigLuna {
  const groqKey = groqApiKey();
  if (!groqKey) return config;

  return {
    ...config,
    modeloMenor: groqMenorModelId(),
    apiKeyMenor: groqKey,
    baseUrlMenor: process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1",
  };
}

export function resolveLlmConfig(selection: LlmProviderSelection): ConfigLuna | null {
  if (selection.providerId === "groq" || selection.providerId === "auto") {
    const apiKey = groqApiKey();
    if (!apiKey) return null;

    return {
      apiKey,
      baseUrl: process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1",
      modeloMenor: groqMenorModelId(),
      modeloMaior: groqMaiorModelId(),
      temperaturaMenor: 0,
      temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    };
  }

  if (selection.providerId === "cerebras") {
    const apiKey = cerebrasApiKey();
    if (!apiKey) return null;

    const baseUrl = process.env.CEREBRAS_API_BASE?.trim() || CEREBRAS_BASE;
    const model = resolveCerebrasModelId();

    return attachGroqAuxiliar({
      apiKey,
      baseUrl,
      modeloMenor: model,
      modeloMaior: model,
      temperaturaMenor: 0,
      temperaturaMaior: Number(process.env.CEREBRAS_TEMPERATURA ?? process.env.LUNA_TEMPERATURA_MAIOR ?? 1),
    });
  }

  return null;
}

export function providerLabel(selection: LlmProviderSelection): string {
  const opt = listConfiguredProviderOptions().find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  return opt?.label ?? `${selection.providerId}/${selection.modelKey}`;
}

/** Stream SSE disponível quando Cerebras está configurado e LUNA_STREAM_ENABLED ≠ 0. */
export function isStreamSupported(): boolean {
  if (process.env.LUNA_STREAM_ENABLED === "0") return false;
  return Boolean(cerebrasApiKey());
}
