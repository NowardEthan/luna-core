import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { isLunaBillingApiConfigured } from '../config/lunaBillingApi';
import { subscribeUserProfile } from '../lib/firebase/firestoreUserProfile';
import { parseBilling } from '../features/billing/parseBilling';
import { syncAsaasBilling, syncTrialBilling } from '../features/billing/billingApi';
import { parsePlanId, type LunaBillingState, type LunaPlanId } from '../features/billing/types';

export type UseLunaBillingResult = {
  plan: LunaPlanId;
  billing: LunaBillingState | null;
  billingOverdue: boolean;
  onTrial: boolean;
  loading: boolean;
  refreshAccount: () => Promise<void>;
};

/** Plano e estado de assinatura — alinhado ao orbit-legacy. */
export function useLunaBilling(
  uid: string | null,
  getIdToken: () => Promise<string | null>,
  isAnonymous: boolean,
): UseLunaBillingResult {
  const [plan, setPlan] = useState<LunaPlanId>('free');
  const [billing, setBilling] = useState<LunaBillingState | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid || isAnonymous) {
      setPlan('free');
      setBilling(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeUserProfile(
      uid,
      (doc) => {
        setPlan(parsePlanId(doc?.plan));
        setBilling(parseBilling(doc?.billing));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid, isAnonymous]);

  const refreshAccount = useCallback(async () => {
    if (!uid || isAnonymous || !isLunaBillingApiConfigured()) return;
    await syncTrialBilling(getIdToken);
    await syncAsaasBilling(getIdToken);
  }, [uid, isAnonymous, getIdToken]);

  useEffect(() => {
    if (!uid || isAnonymous) return;
    void refreshAccount();
  }, [uid, isAnonymous, refreshAccount]);

  useEffect(() => {
    if (!uid || isAnonymous) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAccount();
    });
    return () => sub.remove();
  }, [uid, isAnonymous, refreshAccount]);

  return useMemo(
    () => ({
      plan,
      billing,
      billingOverdue: billing?.status === 'overdue',
      onTrial: billing?.status === 'trial',
      loading,
      refreshAccount,
    }),
    [plan, billing, loading, refreshAccount],
  );
}
