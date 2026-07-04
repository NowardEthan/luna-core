import AsyncStorage from '@react-native-async-storage/async-storage';

export type LunaProviderId = 'groq' | 'openrouter' | 'auto';
export type LunaModelKey = 'default' | 'qwen-next' | 'qwen-coder' | 'auto';

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
  providerId: 'auto',
  modelKey: 'auto',
};

function isProviderId(v: unknown): v is LunaProviderId {
  return v === 'groq' || v === 'openrouter' || v === 'auto';
}

function isModelKey(v: unknown): v is LunaModelKey {
  return v === 'default' || v === 'qwen-next' || v === 'qwen-coder' || v === 'auto';
}

export function isAutoProviderSelection(selection: LunaProviderSelection): boolean {
  return selection.providerId === 'auto' || selection.modelKey === 'auto';
}

/** Lê a escolha persistida no dispositivo. */
export async function loadLunaProviderSelection(): Promise<LunaProviderSelection> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LUNA_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<LunaProviderSelection>;
    if (isProviderId(parsed.providerId) && isModelKey(parsed.modelKey)) {
      return { providerId: parsed.providerId, modelKey: parsed.modelKey };
    }
  } catch {
    /* ignora JSON inválido */
  }
  return DEFAULT_LUNA_PROVIDER;
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

/** Primeira opção disponível no servidor ou fallback automático. */
export function pickAvailableProvider(
  options: LunaProviderOption[] | undefined,
  current: LunaProviderSelection,
): LunaProviderSelection {
  if (isProviderOptionAvailable(current, options)) return current;

  if (isAutoProviderSelection(current)) {
    const auto = options?.find((o) => o.providerId === 'auto' && o.modelKey === 'auto');
    if (auto) return { providerId: 'auto', modelKey: 'auto' };
  }

  const groq = options?.find((o) => o.providerId === 'groq' && o.modelKey === 'default');
  if (groq) return { providerId: groq.providerId, modelKey: groq.modelKey };

  const first = options?.find((o) => o.modelKey !== 'auto');
  if (first) return { providerId: first.providerId, modelKey: first.modelKey };

  return DEFAULT_LUNA_PROVIDER;
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
  if (selection.providerId === 'groq') return 'Groq';
  if (selection.modelKey === 'qwen-coder') return 'Qwen Coder (OpenRouter)';
  return 'Qwen Next (OpenRouter)';
}

/** Opção Groq quando a API ainda não expõe `llmProviders` (deploy antigo). */
export const LEGACY_GROQ_OPTION: LunaProviderOption = {
  providerId: 'groq',
  modelKey: 'default',
  label: 'Groq · servidor',
  description: 'Modelo configurado no Railway. Faça redeploy para ver Auto e OpenRouter.',
  modelId: 'openai/gpt-oss-120b',
};

export type ProviderOptionsFromHealth = {
  options: LunaProviderOption[];
  apiReachable: boolean;
  legacyApi: boolean;
};

/** Constrói lista de modelos a partir do /health (compatível com API antiga). */
export function buildProviderOptionsFromHealth(
  health: {
    ok?: boolean;
    llmConfigured?: boolean;
    llmProviders?: LunaProviderOption[];
  } | null,
): ProviderOptionsFromHealth {
  if (!health?.ok) {
    return { options: [], apiReachable: false, legacyApi: false };
  }

  if (health.llmProviders && health.llmProviders.length > 0) {
    return { options: health.llmProviders, apiReachable: true, legacyApi: false };
  }

  if (health.llmConfigured) {
    return { options: [LEGACY_GROQ_OPTION], apiReachable: true, legacyApi: true };
  }

  return { options: [], apiReachable: true, legacyApi: false };
}
