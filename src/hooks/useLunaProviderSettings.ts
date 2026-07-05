import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LUNA_PROVIDER,
  FREE_PLAN_DEFAULT_PROVIDER,
  buildProviderOptionsFromHealth,
  loadLunaProviderSelection,
  pickAvailableProvider,
  saveLunaProviderSelection,
  type LunaProviderOption,
  type LunaProviderSelection,
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
      const [stored, healthData] = await Promise.all([
        loadLunaProviderSelection(planId),
        lunaHealth(),
      ]);
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
    ],
  );
}
