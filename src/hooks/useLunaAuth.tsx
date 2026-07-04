import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';

import { isFirebaseConfigured } from '../lib/firebase/config';
import { getLunaAuth } from '../lib/firebase/client';
import { ensureUserProfile } from '../lib/firebase/firestoreChat';

export type LunaAuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  uid: string | null;
  error: string | null;
  getIdToken: () => Promise<string | null>;
  signOutAndReset: () => Promise<void>;
};

const LunaAuthContext = createContext<LunaAuthContextValue | null>(null);

export function LunaAuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getLunaAuth();
    if (!auth) {
      setLoading(false);
      setError('Firebase não inicializou.');
      return;
    }

    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (next) => {
      if (cancelled) return;

      if (!next) {
        try {
          const cred = await signInAnonymously(auth);
          if (!cancelled) setUser(cred.user);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Falha ao autenticar.';
          if (!cancelled) {
            setError(msg);
            setLoading(false);
          }
        }
        return;
      }

      setUser(next);
      setError(null);
      setLoading(false);

      try {
        await ensureUserProfile(next);
      } catch {
        /* perfil opcional — regras podem exigir plan free no create */
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [configured]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const signOutAndReset = useCallback(async (): Promise<void> => {
    const auth = getLunaAuth();
    if (!auth) return;
    await signOut(auth);
    await signInAnonymously(auth);
  }, []);

  const value = useMemo<LunaAuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      uid: user?.uid ?? null,
      error,
      getIdToken,
      signOutAndReset,
    }),
    [configured, loading, user, error, getIdToken, signOutAndReset],
  );

  return <LunaAuthContext.Provider value={value}>{children}</LunaAuthContext.Provider>;
}

export function useLunaAuth(): LunaAuthContextValue {
  const ctx = useContext(LunaAuthContext);
  if (!ctx) {
    return {
      configured: false,
      loading: false,
      user: null,
      uid: null,
      error: null,
      getIdToken: async () => null,
      signOutAndReset: async () => {},
    };
  }
  return ctx;
}
