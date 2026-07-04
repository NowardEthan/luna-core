import {
  GoogleAuthProvider,
  linkWithCredential,
  signInWithCredential,
  type User,
} from 'firebase/auth';

import { getLunaAuth } from './client';
import { ensureUserProfile } from './firestoreChat';

function firebaseAuthCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: string }).code);
  }
  return '';
}

function mapAuthError(err: unknown): Error {
  const code = firebaseAuthCode(err);
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Login cancelado.');
  }
  if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
    return new Error('Esta conta Google já existe — você entrou nela. As conversas anônimas ficaram na sessão anterior.');
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return new Error('Já existe uma conta com este email em outro método de login.');
  }
  if (err instanceof Error) return err;
  return new Error('Não foi possível entrar com Google.');
}

/**
 * Completa login Firebase com id_token Google.
 * Se a sessão atual for anônima, faz link (preserva conversas).
 */
export async function completeGoogleSignInWithIdToken(
  idToken: string,
  accessToken?: string | null,
): Promise<User> {
  const auth = getLunaAuth();
  if (!auth) throw new Error('Firebase não configurado.');

  const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
  const current = auth.currentUser;

  try {
    if (current?.isAnonymous) {
      try {
        const linked = await linkWithCredential(current, credential);
        await ensureUserProfile(linked.user);
        return linked.user;
      } catch (err) {
        const code = firebaseAuthCode(err);
        if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
          const result = await signInWithCredential(auth, credential);
          await ensureUserProfile(result.user);
          return result.user;
        }
        throw err;
      }
    }

    const result = await signInWithCredential(auth, credential);
    await ensureUserProfile(result.user);
    return result.user;
  } catch (err) {
    throw mapAuthError(err);
  }
}
