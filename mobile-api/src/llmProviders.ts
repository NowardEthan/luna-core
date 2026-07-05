import {
  AUTO_REASON_LABELS,
  escolherProvedorAuto,
  isAutoProviderMode,
  type AutoRoutingReason,
} from "./escolherProvedorAuto.js";

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
): Partial<LlmProviderSelection> | undefined {
  if (!input) return input;

  const providerId = input.providerId;
  const modelKey = input.modelKey;

  if (providerId === "openrouter" || modelKey === "qwen-next" || modelKey === "qwen-coder") {
    if (isProviderConfigured("cerebras")) {
      return { providerId: "cerebras", modelKey: "glm-47" };
    }
    return { providerId: "groq", modelKey: "default" };
  }

  if (providerId === "cerebras" && (modelKey === "glm-47" || modelKey === "default" || !modelKey)) {
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

/** Opções expostas ao mobile. */
export function listConfiguredProviderOptions(): LlmProviderOption[] {
  const options: LlmProviderOption[] = [];

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

  return options;
}

/** Opções para UI — inclui automático quando há Groq + Cerebras. */
export function listProviderOptionsForUi(): LlmProviderOption[] {
  const configured = listConfiguredProviderOptions();
  if (configured.length <= 1) return configured;

  return [
    {
      providerId: "auto",
      modelKey: "auto",
      label: "Automático",
      description: "Groq para chat rápido; GLM 4.7 para código, documentos e contexto longo.",
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
): ResolvedLlmProvider | null {
  const available = listConfiguredProviderOptions();
  if (available.length === 0) return null;

  const normalized = normalizeLegacyProviderSelection(input) ?? input;

  if (isAutoProviderMode(normalized)) {
    if (!message?.trim()) {
      const groq = available.find((o) => o.providerId === "groq");
      const first = groq ?? available[0]!;
      return {
        selection: { providerId: first.providerId, modelKey: first.modelKey },
        autoReason: "fallback",
        autoReasonLabel: AUTO_REASON_LABELS.fallback,
      };
    }
    const routed = escolherProvedorAuto(message, available);
    return {
      selection: routed.selection,
      autoReason: routed.reason,
      autoReasonLabel: AUTO_REASON_LABELS[routed.reason],
    };
  }

  const requestedProvider = normalized?.providerId;
  const requestedModel = normalized?.modelKey;

  if (requestedProvider && requestedModel) {
    const match = available.find(
      (o) => o.providerId === requestedProvider && o.modelKey === requestedModel,
    );
    if (match) {
      return { selection: { providerId: match.providerId, modelKey: match.modelKey } };
    }
  }

  if (requestedProvider && requestedProvider !== "auto") {
    const match = available.find((o) => o.providerId === requestedProvider);
    if (match) {
      return { selection: { providerId: match.providerId, modelKey: match.modelKey } };
    }
  }

  const groq = available.find((o) => o.providerId === "groq");
  if (groq) return { selection: { providerId: groq.providerId, modelKey: groq.modelKey } };

  const first = available[0]!;
  return { selection: { providerId: first.providerId, modelKey: first.modelKey } };
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
