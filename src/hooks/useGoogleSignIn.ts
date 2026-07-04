import { useCallback, useState } from 'react';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { getGoogleWebClientId, isGoogleAuthConfigured } from '../config/googleAuth';
import { completeGoogleSignInWithIdToken } from '../lib/firebase/googleSignInMobile';

let configured = false;

function ensureGoogleSignInConfigured() {
  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ausente no .env.');
  }
  if (!configured) {
    GoogleSignin.configure({ webClientId });
    configured = true;
  }
}

function mapGoogleError(err: unknown): Error {
  if (isErrorWithCode(err)) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      return new Error('Login cancelado.');
    }
    if (err.code === statusCodes.IN_PROGRESS) {
      return new Error('Login Google já em progresso.');
    }
    if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new Error('Google Play Services indisponível neste dispositivo.');
    }
    if (err.code === '10') {
      return new Error(
        'OAuth mal configurado. No Google Cloud / Firebase, credencial Android: package com.luna.orbitmobile + SHA-1 debug do projeto: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25 (não o ~/.android/debug.keystore). Web Client ID = Firebase → Auth → Google.',
      );
    }
  }
  if (err instanceof Error) return err;
  return new Error('Erro ao entrar com Google.');
}

/** Google Sign-In nativo (development build) — não usa browser OAuth. */
export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webClientId = getGoogleWebClientId();

  const signInWithGoogle = useCallback(async () => {
    if (!isGoogleAuthConfigured()) {
      throw new Error('Google Sign-In não configurado (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
    }

    setBusy(true);
    setError(null);

    try {
      ensureGoogleSignInConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        throw new Error('Login cancelado.');
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        throw new Error('Google não retornou id_token. Verifique o Web Client ID no Firebase.');
      }

      await completeGoogleSignInWithIdToken(idToken);
    } catch (err) {
      const mapped = mapGoogleError(err);
      setError(mapped.message);
      throw mapped;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    signInWithGoogle,
    busy,
    error,
    ready: isGoogleAuthConfigured(),
    configured: isGoogleAuthConfigured(),
    webClientId,
    androidClientId: null,
  };
}
