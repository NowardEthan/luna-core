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
  modelId: "deepseek/deepseek-v4-pro",
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
 * A0 (Latência com Alma, 2026-07-22): o chat fala com UM provedor só — OpenRouter.
 * Groq/Cerebras deixaram de existir no caminho de texto (eram a origem das quedas
 * CEREBRAS_API_KEY/DNS na conversa real). A key do Groq continua viva SÓ para STT
 * (voz), que o OpenRouter não oferece.
 */
function isGroqChatEnabled(): boolean {
  return false;
}

/** Modo reduzido (quota) continua existindo — mas roda no OpenRouter, como tudo. */
export function isCerebrasReducedFallbackEnabled(): boolean {
  return Boolean(openrouterApiKey());
}

/** Seleção forçada no modo reduzido (quota estourada) — OpenRouter, modelo do plano. */
export const REDUCED_LLM_SELECTION: LlmProviderSelection = {
  providerId: "openrouter",
  modelKey: "default",
};

/** OpenRouter é o cérebro — único provedor de chat (A0). */
export function isOpenrouterChatPrimary(): boolean {
  return Boolean(openrouterApiKey());
}

/** A0: Cerebras nunca mais é primário no chat. */
export function isCerebrasChatPrimary(): boolean {
  return false;
}

const OPENROUTER_CHAT_SELECTION: LlmProviderSelection = {
  providerId: "openrouter",
  modelKey: "default",
};

/** A0: qualquer pedido groq/cerebras/auto no chat vira OpenRouter (provedor único). */
function forcarProvedorPrimario(
  selection: LlmProviderSelection,
  _planId: PlanId,
): LlmProviderSelection {
  if (selection.providerId === "openrouter") return selection;
  if (isOpenrouterChatPrimary()) return OPENROUTER_CHAT_SELECTION;
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

/**
 * Normaliza pedidos legados (qwen-*, cerebras, groq) — A0: tudo converge no OpenRouter.
 * `auto` continua auto (o roteador escolhe o MODELO, nunca outro provedor).
 */
export function normalizeLegacyProviderSelection(
  input?: Partial<{ providerId?: string; modelKey?: string }>,
  _planId: PlanId = "free",
): Partial<LlmProviderSelection> | undefined {
  if (!input) return input;

  const providerId = input.providerId;
  const modelKey = input.modelKey;

  if (modelKey === "qwen-next" || modelKey === "qwen-coder") {
    return { providerId: "auto", modelKey: "auto" };
  }

  if (providerId === "auto" || modelKey === "auto") {
    return { providerId: "auto", modelKey: "auto" };
  }

  // App antigo pedindo cerebras/groq: recebe o cérebro atual (OpenRouter).
  if (providerId === "cerebras" || providerId === "groq" || providerId === "openrouter") {
    return OPENROUTER_CHAT_SELECTION;
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

  // A0: Cerebras e Groq não são mais listados — o chat é OpenRouter, ponto.
  return options;
}

function preferDefaultProvider(
  available: LlmProviderOption[],
  _planId: PlanId = "free",
): LlmProviderSelection {
  const openrouter = available.find((o) => o.providerId === "openrouter");
  if (openrouter) {
    return { providerId: openrouter.providerId, modelKey: openrouter.modelKey };
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

function resolveOpenrouterConfig(planId?: PlanId): ConfigLuna | null {
  const apiKey = openrouterApiKey();
  if (!apiKey) return null;

  const baseUrl = process.env.OPENROUTER_API_BASE?.trim() || OPENROUTER_BASE;
  const model = resolveOpenrouterModelId();
  // Modelo AUXILIAR/leve (flash): é o que o gate de peso usa no turno casual e o que
  // o pipeline usa nas chamadas leves (análise/intenção/memória). Sem um modelo menor
  // DISTINTO, modeloMenor === modeloMaior (Pro) e o gate nunca rebaixa → tudo ia pro
  // Pro (caro e lento). Configurável por OPENROUTER_MODELO_MENOR.
  const modelMenor = process.env.OPENROUTER_MODELO_MENOR?.trim() || "deepseek/deepseek-v4-flash";

  // A0: plano diferencia MODELO, não provedor. Free responde no modelo leve
  // (ou no OPENROUTER_MODEL_FREE, se definido); pago responde no Pro.
  const freeModel = process.env.OPENROUTER_MODEL_FREE?.trim() || modelMenor;
  const modeloMaior = planId && !isPremiumModelAllowed(planId) ? freeModel : model;

  return {
    apiKey,
    baseUrl,
    modeloMenor: modelMenor,
    modeloMaior,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.OPENROUTER_TEMPERATURA ?? process.env.LUNA_TEMPERATURA_MAIOR ?? 1),
  };
}

/**
 * A0: funil único — SEJA QUAL FOR a seleção pedida (groq/cerebras/auto/legado),
 * a config de chat que sai daqui é OpenRouter. Um provedor, uma chave, um DNS.
 */
export function resolveLlmConfig(
  _selection: LlmProviderSelection,
  planId?: PlanId,
): ConfigLuna | null {
  return resolveOpenrouterConfig(planId);
}

export function providerLabel(selection: LlmProviderSelection): string {
  const opt = listConfiguredProviderOptions().find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  return opt?.label ?? `${selection.providerId}/${selection.modelKey}`;
}

/** Stream SSE disponível quando OpenRouter está configurado e LUNA_STREAM_ENABLED ≠ 0. */
export function isStreamSupported(): boolean {
  if (process.env.LUNA_STREAM_ENABLED === "0") return false;
  return Boolean(openrouterApiKey());
}
