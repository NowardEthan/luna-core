import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  canAnalyzeImages,
  canExtractDocuments,
  canSendCloudTurn,
  canTranscribeVoice,
  quotaApplies,
  remainingTurns,
} from '../features/billing/quotaUtils';
import {
  useLunaUsage,
  type LunaUsageSnapshot,
  type QuotaKind,
} from '../features/billing/useLunaUsage';
import type { LunaPlanId } from '../features/billing/types';
import { useLunaAuth } from './useLunaAuth';
import { useLunaBilling, type UseLunaBillingResult } from './useLunaBilling';

export type LunaUsageContextValue = UseLunaBillingResult & {
  usage: LunaUsageSnapshot;
  plan: LunaPlanId;
  cloudEnabled: boolean;
  isAnonymous: boolean;
  quotaApplies: boolean;
  canSendCloudTurn: boolean;
  canAnalyzeImages: (count: number) => boolean;
  canExtractDocuments: (count: number) => boolean;
  canTranscribeVoice: () => boolean;
  isExceeded: boolean;
  remaining: number | null;
  bumpUsage: (kind: QuotaKind, amount?: number) => void;
  refreshUsage: () => Promise<void>;
};

const LunaUsageContext = createContext<LunaUsageContextValue | null>(null);

export function LunaUsageProvider({ children }: { children: ReactNode }) {
  const auth = useLunaAuth();
  const isAnonymous = auth.user?.isAnonymous ?? true;
  const billing = useLunaBilling(auth.uid, auth.getIdToken, isAnonymous);
  const usageState = useLunaUsage(billing.plan, auth.uid, auth.getIdToken);
  const cloudEnabled = auth.configured && auth.uid != null;

  const value = useMemo((): LunaUsageContextValue => {
    const { bumpUsage, refreshFromApi, ...usage } = usageState;
    const applies = quotaApplies(cloudEnabled, isAnonymous, usage);
    const canSend = canSendCloudTurn(cloudEnabled, isAnonymous, usage);
    return {
      ...billing,
      usage,
      cloudEnabled,
      isAnonymous,
      quotaApplies: applies,
      canSendCloudTurn: canSend,
      canAnalyzeImages: (count) => canAnalyzeImages(cloudEnabled, isAnonymous, usage, count),
      canExtractDocuments: (count) => canExtractDocuments(cloudEnabled, isAnonymous, usage, count),
      canTranscribeVoice: () => canTranscribeVoice(cloudEnabled, isAnonymous, usage),
      isExceeded: applies && !canSend,
      remaining: remainingTurns(usage),
      bumpUsage,
      refreshUsage: async () => {
        const token = await auth.getIdToken();
        console.log('[LunaUsageContext] refreshUsage token', { hasToken: Boolean(token), tokenPreview: token ? `${token.slice(0, 20)}...` : null });
        if (token) await refreshFromApi(token);
      },
    };
  }, [auth, billing, cloudEnabled, isAnonymous, usageState]);

  return <LunaUsageContext.Provider value={value}>{children}</LunaUsageContext.Provider>;
}

export function useLunaUsageContext(): LunaUsageContextValue {
  const ctx = useContext(LunaUsageContext);
  if (!ctx) {
    throw new Error('useLunaUsageContext deve estar dentro de LunaUsageProvider');
  }
  return ctx;
}
