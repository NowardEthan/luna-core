import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LUNA_PROVIDER,
  buildProviderOptionsFromHealth,
  loadLunaProviderSelection,
  pickAvailableProvider,
  saveLunaProviderSelection,
  type LunaProviderOption,
  type LunaProviderSelection,
} from '../lib/lunaProviderSettings';
import { lunaHealth, type LunaHealthResponse } from '../data/lunaClient';

/** Estado do provedor LLM escolhido no dispositivo, validado contra /health. */
export function useLunaProviderSettings() {
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
      const [stored, healthData] = await Promise.all([loadLunaProviderSelection(), lunaHealth()]);
      if (!mountedRef.current) return { selection: stored, options: [] };

      const built = buildProviderOptionsFromHealth(healthData);
      setHealth(healthData);
      setOptions(built.options);
      setLegacyApi(built.legacyApi);
      setApiReachable(built.apiReachable);

      const next = pickAvailableProvider(built.options, stored);
      setSelection(next);
      if (next.providerId !== stored.providerId || next.modelKey !== stored.modelKey) {
        await saveLunaProviderSelection(next);
      }
      setLoaded(true);
      return { selection: next, options: built.options };
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  const setProvider = useCallback(async (next: LunaProviderSelection) => {
    setSelection(next);
    await saveLunaProviderSelection(next);
  }, []);

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
