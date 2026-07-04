import React, { createContext, useContext, type ReactNode } from 'react';
import { useLunaProviderSettings } from './useLunaProviderSettings';
import type { LunaProviderOption, LunaProviderSelection } from '../lib/lunaProviderSettings';
import type { LunaHealthResponse } from '../data/lunaClient';

type LunaProviderContextValue = {
  selection: LunaProviderSelection;
  options: LunaProviderOption[];
  loaded: boolean;
  refreshing: boolean;
  health: LunaHealthResponse | null;
  legacyApi: boolean;
  apiReachable: boolean;
  lastRouting: string | null;
  setLastRouting: (reason: string | null) => void;
  setProvider: (next: LunaProviderSelection) => Promise<void>;
  refreshFromServer: () => Promise<{
    selection: LunaProviderSelection;
    options: LunaProviderOption[];
  }>;
};

const LunaProviderContext = createContext<LunaProviderContextValue | null>(null);

export function LunaProviderProvider({ children }: { children: ReactNode }) {
  const value = useLunaProviderSettings();
  return <LunaProviderContext.Provider value={value}>{children}</LunaProviderContext.Provider>;
}

export function useLunaProvider(): LunaProviderContextValue {
  const ctx = useContext(LunaProviderContext);
  if (!ctx) {
    throw new Error('useLunaProvider deve ser usado dentro de LunaProviderProvider.');
  }
  return ctx;
}
