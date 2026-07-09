import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FREE_PLAN_DEFAULT_PROVIDER,
  isGlm47Provider,
  isPremiumModelAllowed,
} from '../features/billing/planModelPolicy';
import type { LunaPlanId } from '../features/billing/types';
import {
  LUNA_BRAND_PULSE,
  LUNA_BRAND_ORBITA,
  LUNA_BRAND_CORE,
  lunaModelBrand,
  lunaModelLabel,
} from './modelBrands';

export { FREE_PLAN_DEFAULT_PROVIDER };

export type LunaProviderId = 'groq' | 'cerebras' | 'openrouter' | 'auto';

export type LunaModelKey = 'default' | 'glm-47' | 'gpt-oss-120b' | 'deepseek-v3.2' | 'auto';

export type LunaProviderSelection = {
  providerId: LunaProviderId;
  modelKey: LunaModelKey;
};

export type LunaProviderOption = {
  providerId: LunaProviderId;
  modelKey: LunaModelKey;
  label: string;
  description: string;
  modelId: string;
};

const STORAGE_KEY = 'orbit.luna.provider';
const REASONING_ENABLED_KEY = 'orbit.luna.reasoning.enabled';
const REASONING_EFFORT_KEY = 'orbit.luna.reasoning.effort';

export type LunaReasoningEffort = 'low' | 'medium' | 'high';

export const DEFAULT_LUNA_PROVIDER: LunaProviderSelection = {
  providerId: 'cerebras',
  modelKey: 'glm-47',
};

function isProviderId(v: unknown): v is LunaProviderId {
  return v === 'groq' || v === 'cerebras' || v === 'openrouter' || v === 'auto';
}

function isModelKey(v: unknown): v is LunaModelKey {
  return v === 'default' || v === 'glm-47' || v === 'gpt-oss-120b' || v === 'deepseek-v3.2' || v === 'auto';
}

/** Converte escolhas antigas (OpenRouter / qwen) e aplica política do plano. */
export function normalizeLegacyProviderSelection(
  raw: Partial<{ providerId?: unknown; modelKey?: unknown }>,
  planId: LunaPlanId = 'free',
): LunaProviderSelection {
  const providerId = raw.providerId;
  const modelKey = raw.modelKey;

  if (providerId === 'openrouter' && (modelKey === 'deepseek-v3.2' || modelKey === 'default' || !modelKey)) {
    return isPremiumModelAllowed(planId)
      ? { providerId: 'openrouter', modelKey: (modelKey === 'deepseek-v3.2' ? 'deepseek-v3.2' : 'default') as LunaModelKey }
      : FREE_PLAN_DEFAULT_PROVIDER;
  }

  if (providerId === 'openrouter' || modelKey === 'qwen-next' || modelKey === 'qwen-coder') {
    return isPremiumModelAllowed(planId)
      ? { providerId: 'openrouter', modelKey: 'default' }
      : FREE_PLAN_DEFAULT_PROVIDER;
  }

  if (providerId === 'cerebras' && (modelKey === 'glm-47' || modelKey === 'gpt-oss-120b' || modelKey === 'default' || !modelKey)) {
    return isPremiumModelAllowed(planId)
      ? { providerId: 'cerebras', modelKey: (modelKey === 'gpt-oss-120b' ? 'gpt-oss-120b' : 'glm-47') as LunaModelKey }
      : FREE_PLAN_DEFAULT_PROVIDER;
  }

  if (providerId === 'groq' && (modelKey === 'default' || modelKey === undefined)) {
    return isPremiumModelAllowed(planId)
      ? DEFAULT_LUNA_PROVIDER
      : { providerId: 'groq', modelKey: 'default' };
  }

  if (providerId === 'auto' || modelKey === 'auto') {
    return isPremiumModelAllowed(planId)
      ? DEFAULT_LUNA_PROVIDER
      : { providerId: 'auto', modelKey: 'auto' };
  }

  if (isProviderId(providerId) && isModelKey(modelKey)) {
    if (!isPremiumModelAllowed(planId) && isGlm47Provider(providerId, modelKey)) {
      return FREE_PLAN_DEFAULT_PROVIDER;
    }
    return { providerId, modelKey };
  }

  return isPremiumModelAllowed(planId) ? DEFAULT_LUNA_PROVIDER : FREE_PLAN_DEFAULT_PROVIDER;
}

export function isAutoProviderSelection(selection: LunaProviderSelection): boolean {
  return selection.providerId === 'auto' || selection.modelKey === 'auto';
}

/** Lê a escolha persistida no dispositivo. */
export async function loadLunaProviderSelection(
  planId: LunaPlanId = 'free',
): Promise<LunaProviderSelection> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return isPremiumModelAllowed(planId) ? DEFAULT_LUNA_PROVIDER : FREE_PLAN_DEFAULT_PROVIDER;
    }
    const parsed = JSON.parse(raw) as Partial<{ providerId?: unknown; modelKey?: unknown }>;
    return normalizeLegacyProviderSelection(parsed, planId);
  } catch {
    /* ignora JSON inválido */
  }
  return isPremiumModelAllowed(planId) ? DEFAULT_LUNA_PROVIDER : FREE_PLAN_DEFAULT_PROVIDER;
}

/** Grava a escolha no dispositivo. */
export async function saveLunaProviderSelection(selection: LunaProviderSelection): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

function isReasoningEffort(v: unknown): v is LunaReasoningEffort {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** Lê se o raciocínio visível está ativado (default: true). */
export async function loadReasoningEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(REASONING_ENABLED_KEY);
    return raw == null ? true : raw === 'true';
  } catch {
    return true;
  }
}

/** Grava se o raciocínio visível está ativado. */
export async function saveReasoningEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(REASONING_ENABLED_KEY, String(enabled));
}

/** Lê o nível de raciocínio (default: medium). */
export async function loadReasoningEffort(): Promise<LunaReasoningEffort> {
  try {
    const raw = await AsyncStorage.getItem(REASONING_EFFORT_KEY);
    return isReasoningEffort(raw) ? raw : 'medium';
  } catch {
    return 'medium';
  }
}

/** Grava o nível de raciocínio. */
export async function saveReasoningEffort(effort: LunaReasoningEffort): Promise<void> {
  await AsyncStorage.setItem(REASONING_EFFORT_KEY, effort);
}

/** Valida se a opção ainda existe no servidor (health). */
export function isProviderOptionAvailable(
  selection: LunaProviderSelection,
  options: LunaProviderOption[] | undefined,
): boolean {
  if (!options?.length) return true;
  return options.some(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
}

/** Primeira opção disponível no servidor, respeitando o plano. */
export function pickAvailableProvider(
  options: LunaProviderOption[] | undefined,
  current: LunaProviderSelection,
  planId: LunaPlanId = 'free',
): LunaProviderSelection {
  const normalized = normalizeLegacyProviderSelection(current, planId);
  if (isProviderOptionAvailable(normalized, options)) return normalized;

  if (isPremiumModelAllowed(planId)) {
    const cerebras = options?.find((o) => o.providerId === 'cerebras' && o.modelKey === 'glm-47');
    if (cerebras) return { providerId: cerebras.providerId, modelKey: cerebras.modelKey };
  }

  const groq = options?.find((o) => o.providerId === 'groq' && o.modelKey === 'default');
  if (groq) return { providerId: groq.providerId, modelKey: groq.modelKey };

  const auto = options?.find((o) => o.providerId === 'auto' && o.modelKey === 'auto');
  if (auto) return { providerId: 'auto', modelKey: 'auto' };

  if (isPremiumModelAllowed(planId)) {
    return DEFAULT_LUNA_PROVIDER;
  }

  return FREE_PLAN_DEFAULT_PROVIDER;
}

export function providerOptionLabel(
  selection: LunaProviderSelection,
  options: LunaProviderOption[] | undefined,
): string {
  if (isAutoProviderSelection(selection)) {
    return lunaModelBrand('auto', 'auto').fullName;
  }
  const match = options?.find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  if (match) return lunaModelBrand(match.providerId, match.modelKey).fullName;
  return lunaModelLabel(selection.providerId, selection.modelKey, { full: true });
}

/** Opção legacy quando a API ainda não expõe `llmProviders`. */
export const LEGACY_GROQ_OPTION: LunaProviderOption = {
  providerId: 'groq',
  modelKey: 'default',
  label: LUNA_BRAND_PULSE.fullName,
  description: LUNA_BRAND_PULSE.description,
  modelId: 'openai/gpt-oss-120b',
};

const CEREBRAS_GLM_OPTION: LunaProviderOption = {
  providerId: 'cerebras',
  modelKey: 'glm-47',
  label: LUNA_BRAND_CORE.fullName,
  description: LUNA_BRAND_CORE.description,
  modelId: 'zai-glm-4.7',
};

const AUTO_PROVIDER_OPTION: LunaProviderOption = {
  providerId: 'auto',
  modelKey: 'auto',
  label: LUNA_BRAND_ORBITA.fullName,
  description: LUNA_BRAND_ORBITA.description,
  modelId: 'auto',
};

/** Repõe Cerebras/Auto se /health veio filtrado (bug deploy antigo ou plano free no servidor). */
function ensureFullProviderCatalog(
  options: LunaProviderOption[],
  health: { streamSupported?: boolean },
): LunaProviderOption[] {
  const list = [...options];
  const hasGroq = list.some((o) => o.providerId === 'groq' && o.modelKey === 'default');
  const hasCerebras = list.some((o) => o.providerId === 'cerebras' && o.modelKey === 'glm-47');

  if (health.streamSupported && hasGroq && !hasCerebras) {
    list.push(CEREBRAS_GLM_OPTION);
  }

  const modes = list.filter((o) => o.modelKey !== 'auto');
  const hasAuto = list.some((o) => o.modelKey === 'auto');
  if (modes.length > 1 && !hasAuto) {
    list.unshift(AUTO_PROVIDER_OPTION);
  }

  return list;
}

export type ProviderOptionsFromHealth = {
  options: LunaProviderOption[];
  apiReachable: boolean;
  legacyApi: boolean;
};

function normalizeHealthOption(opt: {
  providerId: string;
  modelKey: string;
  label: string;
  description: string;
  modelId: string;
}): LunaProviderOption | null {
  if (opt.providerId === 'auto' && opt.modelKey === 'auto') {
    const brand = LUNA_BRAND_ORBITA;
    return {
      providerId: 'auto',
      modelKey: 'auto',
      label: brand.fullName,
      description: brand.description,
      modelId: opt.modelId,
    };
  }

  if (opt.providerId === 'openrouter' && (opt.modelKey === 'default' || opt.modelKey === 'deepseek-v3.2')) {
    const brand = lunaModelBrand(opt.providerId, opt.modelKey);
    return {
      providerId: 'openrouter',
      modelKey: opt.modelKey as LunaModelKey,
      label: brand.fullName,
      description: brand.description,
      modelId: opt.modelId,
    };
  }

  if (opt.providerId === 'openrouter' || opt.modelKey === 'qwen-next' || opt.modelKey === 'qwen-coder') {
    return null;
  }

  if (opt.providerId === 'groq' && opt.modelKey === 'default') {
    const brand = LUNA_BRAND_PULSE;
    return {
      providerId: 'groq',
      modelKey: 'default',
      label: brand.fullName,
      description: brand.description,
      modelId: opt.modelId,
    };
  }

  if (opt.providerId === 'cerebras' && (opt.modelKey === 'glm-47' || opt.modelKey === 'gpt-oss-120b')) {
    const brand = lunaModelBrand(opt.providerId, opt.modelKey);
    return {
      providerId: 'cerebras',
      modelKey: opt.modelKey as LunaModelKey,
      label: brand.fullName,
      description: brand.description,
      modelId: opt.modelId,
    };
  }

  return null;
}

/** Constrói lista de modelos a partir do /health (compatível com API antiga). */
export function buildProviderOptionsFromHealth(
  health: {
    ok?: boolean;
    llmConfigured?: boolean;
    streamSupported?: boolean;
    llmProviders?: Array<{
      providerId: string;
      modelKey: string;
      label: string;
      description: string;
      modelId: string;
    }>;
  } | null,
): ProviderOptionsFromHealth {
  if (!health?.ok) {
    return { options: [], apiReachable: false, legacyApi: false };
  }

  if (health.llmProviders && health.llmProviders.length > 0) {
    const options = ensureFullProviderCatalog(
      health.llmProviders.map(normalizeHealthOption).filter((o): o is LunaProviderOption => o !== null),
      health,
    );
    if (options.length > 0) {
      return { options, apiReachable: true, legacyApi: false };
    }
  }

  if (health.llmConfigured) {
    return { options: [LEGACY_GROQ_OPTION], apiReachable: true, legacyApi: true };
  }

  return { options: [], apiReachable: true, legacyApi: false };
}

/** Há mais de um modo de resposta para mostrar na UI? */
export function hasMultipleProviderOptions(options: LunaProviderOption[]): boolean {
  return options.filter((o) => o.modelKey !== 'auto').length > 1;
}
