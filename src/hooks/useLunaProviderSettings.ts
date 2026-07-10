import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  DEFAULT_LUNA_PROVIDER,
  FREE_PLAN_DEFAULT_PROVIDER,
  buildProviderOptionsFromHealth,
  loadLunaProviderSelection,
  loadReasoningEffort,
  loadReasoningEnabled,
  pickAvailableProvider,
  saveLunaProviderSelection,
  saveReasoningEffort,
  saveReasoningEnabled,
  type LunaProviderOption,
  type LunaProviderSelection,
  type LunaReasoningEffort,
} from '../lib/lunaProviderSettings';
import {
  filterProviderOptionsForPlan,
  isGlm47Provider,
  isPremiumModelAllowed,
} from '../features/billing/planModelPolicy';
import type { LunaPlanId } from '../features/billing/types';
import { lunaHealth, type LunaHealthResponse } from '../data/lunaClient';

/** Estado do provedor LLM escolhido no dispositivo, validado contra /health. */
export function useLunaProviderSettings(planId: LunaPlanId = 'free') {
  const [selection, setSelection] = useState<LunaProviderSelection>(DEFAULT_LUNA_PROVIDER);
  const [options, setOptions] = useState<LunaProviderOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<LunaHealthResponse | null>(null);
  const [legacyApi, setLegacyApi] = useState(false);
  const [apiReachable, setApiReachable] = useState(false);
  const [lastRouting, setLastRouting] = useState<string | null>(null);
  const [reasoningEnabled, setReasoningEnabledState] = useState<boolean>(true);
  const [reasoningEffort, setReasoningEffortState] = useState<LunaReasoningEffort>('medium');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshFromServer = useCallback(async () => {
    setRefreshing(true);
    try {
      const [stored, healthData, enabled, effort] = await Promise.all([
        loadLunaProviderSelection(planId),
        lunaHealth(),
        loadReasoningEnabled(),
        loadReasoningEffort(),
      ]);
      setReasoningEnabled(enabled);
      setReasoningEffort(effort);
      if (!mountedRef.current) return { selection: stored, options: [] };

      const built = buildProviderOptionsFromHealth(healthData);
      const planOptions = filterProviderOptionsForPlan(planId, built.options);
      setHealth(healthData);
      setOptions(planOptions);
      setLegacyApi(built.legacyApi);
      setApiReachable(built.apiReachable);

      const next = pickAvailableProvider(planOptions, stored, planId);
      setSelection(next);
      if (next.providerId !== stored.providerId || next.modelKey !== stored.modelKey) {
        await saveLunaProviderSelection(next);
      }
      setLoaded(true);
      return { selection: next, options: planOptions };
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [planId]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  // Ao voltar do background, re-valida a saúde da API — senão o banner de
  // "Luna API indisponível" fica preso num estado velho de quando o app abriu.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refreshFromServer();
    });
    return () => sub.remove();
  }, [refreshFromServer]);

  const setProvider = useCallback(
    async (next: LunaProviderSelection) => {
      const clamped =
        !isPremiumModelAllowed(planId) && isGlm47Provider(next.providerId, next.modelKey)
          ? FREE_PLAN_DEFAULT_PROVIDER
          : next;
      setSelection(clamped);
      await saveLunaProviderSelection(clamped);
    },
    [planId],
  );

  const setReasoningEnabled = useCallback(
    async (enabled: boolean) => {
      setReasoningEnabledState(enabled);
      await saveReasoningEnabled(enabled);
    },
    [],
  );

  const setReasoningEffort = useCallback(
    async (effort: LunaReasoningEffort) => {
      setReasoningEffortState(effort);
      await saveReasoningEffort(effort);
    },
    [],
  );

  return useMemo(
    () => ({
      selection,
      options,
      loaded,
      refreshing,
      health,
      legacyApi,
      apiReachable,
      lastRouting,
      setLastRouting,
      setProvider,
      refreshFromServer,
      reasoningEnabled,
      reasoningEffort,
      setReasoningEnabled,
      setReasoningEffort,
    }),
    [
      selection,
      options,
      loaded,
      refreshing,
      health,
      legacyApi,
      apiReachable,
      lastRouting,
      setProvider,
      refreshFromServer,
      reasoningEnabled,
      reasoningEffort,
      setReasoningEnabled,
      setReasoningEffort,
    ],
  );
}
