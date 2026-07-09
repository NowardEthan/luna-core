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
  isGlm47Provider,
  isPremiumModelAllowed,
} from "./billing/planModelPolicy.js";
import {
  AUTO_BRAND_DESCRIPTION_FREE,
  AUTO_BRAND_DESCRIPTION_PREMIUM,
  FREE_PLAN_BRAND_NOTICE,
  LUNA_BRAND_PULSE,
  LUNA_BRAND_ORBITA,
  LUNA_BRAND_CORE,
} from "./modelBrands.js";

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

export type LlmProviderId = "groq" | "cerebras" | "openrouter" | "auto";

export type LlmModelKey = "default" | "glm-47" | "gpt-oss-120b" | "auto";

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
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const GROQ_DEFAULT = {
  label: LUNA_BRAND_PULSE.fullName,
  description: LUNA_BRAND_PULSE.description,
  modelId: "openai/gpt-oss-120b",
};

const CEREBRAS_GLM_47 = {
  label: LUNA_BRAND_CORE.fullName,
  description: LUNA_BRAND_CORE.description,
  modelId: "zai-glm-4.7",
};

const OPENROUTER_DEEPSEEK = {
  label: LUNA_BRAND_CORE.fullName,
  description: LUNA_BRAND_CORE.description,
  modelId: "deepseek/deepseek-v4-flash",
};

const CEREBRAS_GPT_OSS_120B = {
  label: "Luna Core OSS",
  description: "GPT-OSS-120B no Cerebras — forte em código e raciocínio profundo.",
  modelId: "gpt-oss-120b",
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
    "gpt-oss-120b": CEREBRAS_GPT_OSS_120B,
  },
  openrouter: {
    default: OPENROUTER_DEEPSEEK,
  },
};

export function groqApiKey(): string | undefined {
  return process.env.LUNA_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || undefined;
}

function cerebrasApiKey(): string | undefined {
  return process.env.CEREBRAS_API_KEY?.trim() || undefined;
}

function openrouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function isProviderConfigured(providerId: CatalogProviderId): boolean {
  if (providerId === "groq") return Boolean(groqApiKey());
  if (providerId === "openrouter") return Boolean(openrouterApiKey());
  return Boolean(cerebrasApiKey());
}

/**
 * Groq deixou de ser o cérebro: por padrão só OpenRouter (se houver key) ou
 * Cerebras respondem ao chat. A key do Groq continua viva só para STT (voz)
 * e visão (imagem), que os outros dois não oferecem.
 * Reativa Groq no chat só via LUNA_GROQ_CHAT=1 ou se nenhum dos dois existir
 * (fallback de emergência).
 */
function isGroqChatEnabled(): boolean {
  if (process.env.LUNA_GROQ_CHAT === "1") return true;
  return !cerebrasApiKey() && !openrouterApiKey();
}

export function isCerebrasReducedFallbackEnabled(): boolean {
  return Boolean(cerebrasApiKey());
}

/** Seleção forçada no modo reduzido (tier free Cerebras). */
export const REDUCED_LLM_SELECTION: LlmProviderSelection = {
  providerId: "cerebras",
  modelKey: "gpt-oss-120b",
};

/** OpenRouter (DeepSeek) é o cérebro principal quando configurado — some com Cerebras/Groq no chat. */
export function isOpenrouterChatPrimary(): boolean {
  return Boolean(openrouterApiKey());
}

/** Chat usa Cerebras (GLM) só quando OpenRouter não está configurado — Groq fica só para STT/visão. */
export function isCerebrasChatPrimary(): boolean {
  return Boolean(cerebrasApiKey()) && !isGroqChatEnabled() && !isOpenrouterChatPrimary();
}

const CEREBRAS_CHAT_SELECTION: LlmProviderSelection = {
  providerId: "cerebras",
  modelKey: "glm-47",
};

const OPENROUTER_CHAT_SELECTION: LlmProviderSelection = {
  providerId: "openrouter",
  modelKey: "default",
};

/** Premium + provedor primário configurado: nunca devolve groq/auto para o pipeline de texto. */
function forcarProvedorPrimario(
  selection: LlmProviderSelection,
  planId: PlanId,
): LlmProviderSelection {
  if (!isPremiumModelAllowed(planId)) return selection;
  if (selection.providerId !== "groq" && selection.providerId !== "auto") return selection;
  if (isOpenrouterChatPrimary()) return OPENROUTER_CHAT_SELECTION;
  if (isCerebrasChatPrimary()) return CEREBRAS_CHAT_SELECTION;
  return selection;
}

function finalizeSelection(selection: LlmProviderSelection, planId: PlanId): LlmProviderSelection {
  return clampProviderSelectionForPlan(planId, forcarProvedorPrimario(selection, planId));
}

function resolveCerebrasModelId(): string {
  return process.env.CEREBRAS_MODEL?.trim() || CEREBRAS_GLM_47.modelId;
}

function resolveCerebrasModelIdForSelection(selection: LlmProviderSelection): string {
  if (selection.modelKey === "gpt-oss-120b") return CEREBRAS_GPT_OSS_120B.modelId;
  if (selection.modelKey === "glm-47") return CEREBRAS_GLM_47.modelId;
  return resolveCerebrasModelId();
}

/** Modelo Cerebras para os neurônios/análise (menor). Cai no principal se não configurado. */
function resolveCerebrasMenorModelId(): string {
  return process.env.CEREBRAS_MODEL_MENOR?.trim() || resolveCerebrasModelId();
}

export function groqMenorModelId(): string {
  return process.env.LUNA_MODELO_MENOR?.trim() || "llama-3.1-8b-instant";
}

function groqMaiorModelId(): string {
  return process.env.LUNA_MODELO_MAIOR?.trim() || GROQ_DEFAULT.modelId;
}

function resolveOpenrouterModelId(): string {
  return process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEEPSEEK.modelId;
}

/** Normaliza pedidos legados (qwen-*) para o provedor primário atual. */
export function normalizeLegacyProviderSelection(
  input?: Partial<{ providerId?: string; modelKey?: string }>,
  planId: PlanId = "free",
): Partial<LlmProviderSelection> | undefined {
  if (!input) return input;

  const providerId = input.providerId;
  const modelKey = input.modelKey;

  if (modelKey === "qwen-next" || modelKey === "qwen-coder") {
    return { providerId: "auto", modelKey: "auto" };
  }

  if (providerId === "openrouter" && (modelKey === "default" || !modelKey)) {
    if (!isPremiumModelAllowed(planId)) {
      return { providerId: "groq", modelKey: "default" };
    }
    return OPENROUTER_CHAT_SELECTION;
  }

  if (providerId === "cerebras" && (modelKey === "glm-47" || modelKey === "default" || !modelKey)) {
    if (!isPremiumModelAllowed(planId)) {
      return { providerId: "groq", modelKey: "default" };
    }
    return { providerId: "cerebras", modelKey: "glm-47" };
  }

  if (providerId === "groq" || providerId === "auto") {
    if (isPremiumModelAllowed(planId)) {
      if (isOpenrouterChatPrimary()) return OPENROUTER_CHAT_SELECTION;
      if (isCerebrasChatPrimary()) return CEREBRAS_CHAT_SELECTION;
    }
    return {
      providerId: providerId as LlmProviderId,
      modelKey: (modelKey === "auto" ? "auto" : "default") as LlmModelKey,
    };
  }

  return input as Partial<LlmProviderSelection>;
}

/** Opções expostas ao mobile (OpenRouter > Cerebras > Groq — a primeira é o default). */
export function listConfiguredProviderOptions(): LlmProviderOption[] {
  const options: LlmProviderOption[] = [];

  if (isProviderConfigured("openrouter")) {
    const m = MODELS.openrouter.default!;
    options.push({
      providerId: "openrouter",
      modelKey: "default",
      label: m.label,
      description: m.description,
      modelId: resolveOpenrouterModelId(),
      configured: true,
    });
  }

  if (isProviderConfigured("cerebras")) {
    const preferGptOss = process.env.CEREBRAS_PREFER_GPT_OSS === "1" || process.env.CEREBRAS_MODEL?.trim() === CEREBRAS_GPT_OSS_120B.modelId;
    const primaryKey: CatalogModelKey = preferGptOss ? "gpt-oss-120b" : "glm-47";
    const fallbackKey: CatalogModelKey = preferGptOss ? "glm-47" : "gpt-oss-120b";

    for (const key of [primaryKey, fallbackKey]) {
      const m = MODELS.cerebras[key];
      if (!m) continue;
      options.push({
        providerId: "cerebras",
        modelKey: key,
        label: m.label,
        description: m.description,
        modelId: key === "glm-47" ? resolveCerebrasModelId() : m.modelId,
        configured: true,
      });
    }
  }

  // Groq permanece listado para plano free (Core/Cerebras é filtrado por plano).
  // O cérebro premium usa Cerebras via preferDefaultProvider + resolveLlmConfig.
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
    const openrouter = available.find((o) => o.providerId === "openrouter");
    if (openrouter) {
      return { providerId: openrouter.providerId, modelKey: openrouter.modelKey };
    }
    const cerebras = available.find((o) => o.providerId === "cerebras");
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
    ? AUTO_BRAND_DESCRIPTION_PREMIUM
    : AUTO_BRAND_DESCRIPTION_FREE;

  return [
    {
      providerId: "auto",
      modelKey: "auto",
      label: LUNA_BRAND_ORBITA.fullName,
      description: autoDescription,
      modelId: "auto",
      configured: true,
    },
    ...configured,
  ];
}

/**
 * Lista completa para GET /health — **sem** filtro de plano.
 * O mobile filtra localmente (Grátis oculta Core); o chat filtra por uid no POST.
 */
export function listProviderOptionsForHealth(): LlmProviderOption[] {
  const configured = listConfiguredProviderOptions();
  if (configured.length <= 1) return configured;

  return [
    {
      providerId: "auto",
      modelKey: "auto",
      label: LUNA_BRAND_ORBITA.fullName,
      description: LUNA_BRAND_ORBITA.description,
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
      const selection = finalizeSelection(preferDefaultProvider(available, planId), planId);
      return {
        selection,
        autoReason: "fallback",
        autoReasonLabel: isPremiumModelAllowed(planId)
          ? AUTO_REASON_LABELS.fallback
          : FREE_PLAN_BRAND_NOTICE,
      };
    }
    const routed = escolherProvedorAuto(message, available);
    const selection = finalizeSelection(routed.selection, planId);
    const downgraded = !isPremiumModelAllowed(planId) && isGlm47Provider(routed.selection.providerId, routed.selection.modelKey);
    return {
      selection,
      autoReason: routed.reason,
      autoReasonLabel: downgraded ? FREE_PLAN_BRAND_NOTICE : AUTO_REASON_LABELS[routed.reason],
    };
  }

  const requestedProvider = normalized?.providerId;
  const requestedModel = normalized?.modelKey;

  if (requestedProvider && requestedModel) {
    const match = available.find(
      (o) => o.providerId === requestedProvider && o.modelKey === requestedModel,
    );
    if (match) {
      const selection = finalizeSelection(
        { providerId: match.providerId, modelKey: match.modelKey },
        planId,
      );
      return {
        selection,
        ...(requestedGlm && !isPremiumModelAllowed(planId)
          ? { autoReasonLabel: FREE_PLAN_BRAND_NOTICE }
          : {}),
      };
    }
  }

  if (requestedProvider && requestedProvider !== "auto") {
    const match = available.find((o) => o.providerId === requestedProvider);
    if (match) {
      const selection = finalizeSelection(
        { providerId: match.providerId, modelKey: match.modelKey },
        planId,
      );
      return {
        selection,
        ...(requestedGlm && !isPremiumModelAllowed(planId)
          ? { autoReasonLabel: FREE_PLAN_BRAND_NOTICE }
          : {}),
      };
    }
  }

  const selection = finalizeSelection(preferDefaultProvider(available, planId), planId);
  return {
    selection,
    ...(requestedGlm && !isPremiumModelAllowed(planId)
      ? { autoReasonLabel: FREE_PLAN_BRAND_NOTICE }
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

function resolveCerebrasConfig(): ConfigLuna | null {
  const apiKey = cerebrasApiKey();
  if (!apiKey) return null;

  const baseUrl = process.env.CEREBRAS_API_BASE?.trim() || CEREBRAS_BASE;
  const model = resolveCerebrasModelId();
  const modeloMenor = resolveCerebrasMenorModelId();

  const config: ConfigLuna = {
    apiKey,
    baseUrl,
    modeloMenor,
    modeloMaior: model,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.CEREBRAS_TEMPERATURA ?? process.env.LUNA_TEMPERATURA_MAIOR ?? 1),
  };

  // Só cai no Groq para o modelo auxiliar (neurônios) se o chat Groq estiver ativo.
  // Cerebras-only por padrão: os neurônios também rodam no Cerebras.
  return isGroqChatEnabled() ? attachGroqAuxiliar(config) : config;
}

function resolveOpenrouterConfig(): ConfigLuna | null {
  const apiKey = openrouterApiKey();
  if (!apiKey) return null;

  const baseUrl = process.env.OPENROUTER_API_BASE?.trim() || OPENROUTER_BASE;
  const model = resolveOpenrouterModelId();

  const config: ConfigLuna = {
    apiKey,
    baseUrl,
    modeloMenor: model,
    modeloMaior: model,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.OPENROUTER_TEMPERATURA ?? process.env.LUNA_TEMPERATURA_MAIOR ?? 1),
  };

  // Mesma regra do Cerebras: só cai no Groq para o modelo auxiliar se o chat Groq estiver ativo.
  return isGroqChatEnabled() ? attachGroqAuxiliar(config) : config;
}

export function resolveLlmConfig(selection: LlmProviderSelection): ConfigLuna | null {
  // Segurança extra: qualquer pedido groq/auto/cerebras no chat cai no provedor primário.
  if (isOpenrouterChatPrimary() && selection.providerId !== "openrouter") {
    const config = resolveOpenrouterConfig();
    if (config) return config;
  }
  if (isCerebrasChatPrimary() && selection.providerId !== "cerebras") {
    const config = resolveCerebrasConfig();
    if (!config) return null;
    return { ...config, modeloMaior: resolveCerebrasModelIdForSelection(selection) };
  }

  if (selection.providerId === "openrouter") {
    return resolveOpenrouterConfig();
  }

  if (selection.providerId === "groq" || selection.providerId === "auto") {
    if (!isGroqChatEnabled()) {
      const cerebras = resolveCerebrasConfig();
      if (cerebras) {
        return { ...cerebras, modeloMaior: resolveCerebrasModelIdForSelection(selection) };
      }
    }

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
    const config = resolveCerebrasConfig();
    if (!config) return null;
    return { ...config, modeloMaior: resolveCerebrasModelIdForSelection(selection) };
  }

  return null;
}

export function providerLabel(selection: LlmProviderSelection): string {
  const opt = listConfiguredProviderOptions().find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  return opt?.label ?? `${selection.providerId}/${selection.modelKey}`;
}

/** Stream SSE disponível quando Cerebras ou OpenRouter está configurado e LUNA_STREAM_ENABLED ≠ 0. */
export function isStreamSupported(): boolean {
  if (process.env.LUNA_STREAM_ENABLED === "0") return false;
  return Boolean(cerebrasApiKey()) || Boolean(openrouterApiKey());
}
