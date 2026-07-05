import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut, updateProfile, type User } from 'firebase/auth';

import { isFirebaseConfigured } from '../lib/firebase/config';
import { getLunaAuth } from '../lib/firebase/client';
import { ensureUserProfile } from '../lib/firebase/firestoreChat';
import { clearLegacyLocalProfile, saveLocalProfile } from '../lib/profileStorage';

export type LunaAuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  uid: string | null;
  error: string | null;
  getIdToken: () => Promise<string | null>;
  continueAsGuest: (displayName: string) => Promise<void>;
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

      setUser(next);
      setError(null);
      setLoading(false);

      if (!next) return;

      if (!next.isAnonymous) {
        await clearLegacyLocalProfile();
      }

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

  const continueAsGuest = useCallback(async (displayName: string): Promise<void> => {
    const auth = getLunaAuth();
    if (!auth) throw new Error('Firebase não inicializou.');

    const nome = displayName.trim();
    if (nome.length < 2) throw new Error('Informe um nome com pelo menos 2 caracteres.');

    setError(null);
    const cred = await signInAnonymously(auth);
    try {
      await updateProfile(cred.user, { displayName: nome });
    } catch {
      /* displayName opcional no Auth — guardamos local/Firestore */
    }
    await saveLocalProfile({ displayName: nome }, cred.user.uid);
    await ensureUserProfile(cred.user);
    setUser(cred.user);
  }, []);

  const signOutAndReset = useCallback(async (): Promise<void> => {
    const auth = getLunaAuth();
    if (!auth) return;
    await signOut(auth);
  }, []);

  const value = useMemo<LunaAuthContextValue>(
    () => ({
      configured,
      loading,
      user,
      uid: user?.uid ?? null,
      error,
      getIdToken,
      continueAsGuest,
      signOutAndReset,
    }),
    [configured, loading, user, error, getIdToken, continueAsGuest, signOutAndReset],
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
      continueAsGuest: async () => {},
      signOutAndReset: async () => {},
    };
  }
  return ctx;
}
