import { isNetworkFailure, LunaApiError } from '../data/lunaClient';

/** Códigos de falha de rede do SDK do Firebase (uploads / escrita no Firestore). */
const FIREBASE_NETWORK_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'storage/retry-limit-exceeded',
]);

function firebaseErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Classifica um erro como falha de conectividade — nunca usa o `connected`
 * ao vivo do NetInfo (Wi‑Fi com portal cativo reportaria "conectado" mesmo
 * sem internet de verdade). Só o formato/código do próprio erro decide.
 */
export function isNetworkClassifiedError(err: unknown): boolean {
  if (err instanceof LunaApiError && err.code === 'network') return true;
  if (isNetworkFailure(err)) return true;
  const code = firebaseErrorCode(err);
  return code != null && FIREBASE_NETWORK_CODES.has(code);
}
