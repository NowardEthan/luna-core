import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FREE_PLAN_DEFAULT_PROVIDER,
  isGlm47Provider,
  isPremiumModelAllowed,
} from '../features/billing/planModelPolicy';
import type { LunaPlanId } from '../features/billing/types';

export { FREE_PLAN_DEFAULT_PROVIDER };

export type LunaProviderId = 'groq' | 'cerebras' | 'auto';

export type LunaModelKey = 'default' | 'glm-47' | 'auto';

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

export const DEFAULT_LUNA_PROVIDER: LunaProviderSelection = {
  providerId: 'cerebras',
  modelKey: 'glm-47',
};

function isProviderId(v: unknown): v is LunaProviderId {
  return v === 'groq' || v === 'cerebras' || v === 'auto';
}

function isModelKey(v: unknown): v is LunaModelKey {
  return v === 'default' || v === 'glm-47' || v === 'auto';
}

/** Converte escolhas antigas (OpenRouter / qwen) e aplica política do plano. */
export function normalizeLegacyProviderSelection(
  raw: Partial<{ providerId?: unknown; modelKey?: unknown }>,
  planId: LunaPlanId = 'free',
): LunaProviderSelection {
  const providerId = raw.providerId;
  const modelKey = raw.modelKey;

  if (providerId === 'openrouter' || modelKey === 'qwen-next' || modelKey === 'qwen-coder') {
    return isPremiumModelAllowed(planId)
      ? { providerId: 'cerebras', modelKey: 'glm-47' }
      : FREE_PLAN_DEFAULT_PROVIDER;
  }

  if (providerId === 'cerebras' && (modelKey === 'glm-47' || modelKey === 'default' || !modelKey)) {
    return isPremiumModelAllowed(planId)
      ? { providerId: 'cerebras', modelKey: 'glm-47' }
      : FREE_PLAN_DEFAULT_PROVIDER;
  }

  if (providerId === 'groq' && (modelKey === 'default' || modelKey === undefined)) {
    return { providerId: 'groq', modelKey: 'default' };
  }

  if (providerId === 'auto' || modelKey === 'auto') {
    return { providerId: 'auto', modelKey: 'auto' };
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

  const groq = options?.find((o) => o.providerId === 'groq' && o.modelKey === 'default');
  if (groq) return { providerId: groq.providerId, modelKey: groq.modelKey };

  const auto = options?.find((o) => o.providerId === 'auto' && o.modelKey === 'auto');
  if (auto) return { providerId: 'auto', modelKey: 'auto' };

  if (isPremiumModelAllowed(planId)) {
    const cerebras = options?.find((o) => o.providerId === 'cerebras' && o.modelKey === 'glm-47');
    if (cerebras) return { providerId: cerebras.providerId, modelKey: cerebras.modelKey };
  }

  return isPremiumModelAllowed(planId) ? DEFAULT_LUNA_PROVIDER : FREE_PLAN_DEFAULT_PROVIDER;
}

export function providerOptionLabel(
  selection: LunaProviderSelection,
  options: LunaProviderOption[] | undefined,
): string {
  if (isAutoProviderSelection(selection)) return 'Automático';
  const match = options?.find(
    (o) => o.providerId === selection.providerId && o.modelKey === selection.modelKey,
  );
  if (match) return match.label;
  if (selection.providerId === 'cerebras') return 'GLM 4.7';
  return 'Groq';
}

/** Opção Groq quando a API ainda não expõe `llmProviders` (deploy antigo). */
export const LEGACY_GROQ_OPTION: LunaProviderOption = {
  providerId: 'groq',
  modelKey: 'default',
  label: 'Groq · servidor',
  description: 'Modelo configurado no Railway.',
  modelId: 'openai/gpt-oss-120b',
};

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
    return {
      providerId: 'auto',
      modelKey: 'auto',
      label: opt.label,
      description: opt.description,
      modelId: opt.modelId,
    };
  }

  if (opt.providerId === 'openrouter' || opt.modelKey === 'qwen-next' || opt.modelKey === 'qwen-coder') {
    return null;
  }

  if (opt.providerId === 'groq' && opt.modelKey === 'default') {
    return {
      providerId: 'groq',
      modelKey: 'default',
      label: opt.label,
      description: opt.description,
      modelId: opt.modelId,
    };
  }

  if (opt.providerId === 'cerebras' && opt.modelKey === 'glm-47') {
    return {
      providerId: 'cerebras',
      modelKey: 'glm-47',
      label: opt.label,
      description: opt.description,
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
    const options = health.llmProviders
      .map(normalizeHealthOption)
      .filter((o): o is LunaProviderOption => o !== null);
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
