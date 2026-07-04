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

export type LlmProviderId = "groq" | "openrouter" | "auto";

export type LlmModelKey = "default" | "qwen-next" | "qwen-coder" | "auto";

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

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

type CatalogProviderId = Exclude<LlmProviderId, "auto">;
type CatalogModelKey = Exclude<LlmModelKey, "auto">;

const MODELS: Record<
  CatalogProviderId,
  Partial<Record<CatalogModelKey, { label: string; description: string; modelId: string }>>
> = {
  groq: {
    default: {
      label: "Groq · GPT-OSS 120B",
      description: "Rápido; limite ~8k tokens por pedido no tier free.",
      modelId: "openai/gpt-oss-120b",
    },
  },
  openrouter: {
    "qwen-next": {
      label: "OpenRouter · Qwen3 Next 80B (free)",
      description: "Assistente geral, contexto longo — grátis no OpenRouter.",
      modelId: "qwen/qwen3-next-80b-a3b-instruct:free",
    },
    "qwen-coder": {
      label: "OpenRouter · Qwen3 Coder 480B (free)",
      description: "Código e raciocínio técnico — grátis no OpenRouter.",
      modelId: "qwen/qwen3-coder-480b-a35b-instruct:free",
    },
  },
};

function groqApiKey(): string | undefined {
  return process.env.LUNA_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || undefined;
}

function openRouterApiKey(): string | undefined {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.LUNA_API_KEY_MENOR?.trim() ||
    undefined
  );
}

function isProviderConfigured(providerId: LlmProviderId): boolean {
  if (providerId === "groq") return Boolean(groqApiKey());
  return Boolean(openRouterApiKey());
}

/** Opções expostas ao mobile (só as que têm chave no servidor). */
export function listConfiguredProviderOptions(): LlmProviderOption[] {
  const options: LlmProviderOption[] = [];

  if (isProviderConfigured("groq") && MODELS.groq.default) {
    const m = MODELS.groq.default;
    const modelId = process.env.LUNA_MODELO_MAIOR?.trim() || m.modelId;
    options.push({
      providerId: "groq",
      modelKey: "default",
      label: m.label,
      description: m.description,
      modelId,
      configured: true,
    });
  }

  if (isProviderConfigured("openrouter")) {
    for (const key of ["qwen-next", "qwen-coder"] as const) {
      const m = MODELS.openrouter[key];
      if (!m) continue;
      options.push({
        providerId: "openrouter",
        modelKey: key,
        label: m.label,
        description: m.description,
        modelId: m.modelId,
        configured: true,
      });
    }
  }

  return options;
}

/** Opções para UI (inclui modo automático quando há variedade). */
export function listProviderOptionsForUi(): LlmProviderOption[] {
  const configured = listConfiguredProviderOptions();
  if (configured.length <= 1) return configured;

  return [
    {
      providerId: "auto",
      modelKey: "auto",
      label: "Automático",
      description:
        "A Luna escolhe por mensagem: Groq para chat rápido, Qwen Next para documentos, Qwen Coder para código.",
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
  input?: Partial<LlmProviderSelection>,
  message?: string,
): ResolvedLlmProvider | null {
  const available = listConfiguredProviderOptions();
  if (available.length === 0) return null;

  if (isAutoProviderMode(input)) {
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

  const requestedProvider = input?.providerId;
  const requestedModel = input?.modelKey;

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

export function resolveLlmConfig(selection: LlmProviderSelection): ConfigLuna | null {
  if (!isProviderConfigured(selection.providerId)) return null;

  if (selection.providerId === "groq") {
    const apiKey = groqApiKey();
    if (!apiKey) return null;
    const model =
      process.env.LUNA_MODELO_MAIOR?.trim() ||
      MODELS.groq.default?.modelId ||
      "openai/gpt-oss-120b";
    const modelMenor = process.env.LUNA_MODELO_MENOR?.trim() || "llama-3.1-8b-instant";
    return {
      apiKey,
      baseUrl: process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1",
      modeloMenor: modelMenor,
      modeloMaior: model,
      temperaturaMenor: 0,
      temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    };
  }

  const apiKey = openRouterApiKey();
  if (!apiKey) return null;

  const modelDef = MODELS.openrouter[selection.modelKey as "qwen-next" | "qwen-coder"];
  if (!modelDef) return null;

  const model = modelDef.modelId;
  return {
    apiKey,
    baseUrl: process.env.LUNA_API_BASE_MENOR?.trim() || OPENROUTER_BASE,
    modeloMenor: model,
    modeloMaior: model,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.LUNA_TEMPERATURA_MAIOR ?? 0.85),
    apiKeyMenor: apiKey,
    baseUrlMenor: process.env.LUNA_API_BASE_MENOR?.trim() || OPENROUTER_BASE,
  };
}

export function providerLabel(selection: LlmProviderSelection): string {
  const opt = listConfiguredProviderOptions().find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  return opt?.label ?? `${selection.providerId}/${selection.modelKey}`;
}
