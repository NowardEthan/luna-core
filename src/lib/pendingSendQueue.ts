import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ComposerAttachment } from './composerAttachmentModel';
import type { ThreadReference } from './messageReference';
import type { LunaProviderSelection, LunaReasoningEffort } from './lunaProviderSettings';

const QUEUE_KEY = 'orbit.pendingSend.v1.queue';

/** Turno de envio pendente — sobrevive ao fechamento do app até esgotar tentativas ou ter sucesso. */
export interface PendingSendEntry {
  userMessageId: string;
  lunaMessageId: string;
  sessionId: string;
  uid: string | null;
  cloudEnabled: boolean;
  /** Texto já resolvido (com anexos/referência formatados) — é o que vai pra Luna. */
  apiText: string;
  /** Preview pro writeUserTextMessage. */
  firestoreText: string;
  reference?: ThreadReference;
  /** Só anexos já enviados (uri remota) — ver limitação no plano. */
  attachments?: ComposerAttachment[];
  displayName: string;
  timeZone?: string;
  reasoningEnabled: boolean;
  reasoningEffort: LunaReasoningEffort;
  legacyApi: boolean;
  providerId?: LunaProviderSelection['providerId'];
  modelKey?: LunaProviderSelection['modelKey'];
  attempt: number;
  nextAttemptAtMs: number;
  createdAtMs: number;
  /** Evita reescrever o doc do usuário no Firestore em retries. */
  userDocWritten: boolean;
}

export const MAX_SEND_ATTEMPTS = 6;

export function nextBackoffMs(attempt: number): number {
  return Math.min(3_000 * 2 ** attempt, 96_000);
}

function isValidEntry(value: unknown): value is PendingSendEntry {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.userMessageId === 'string' &&
    typeof o.lunaMessageId === 'string' &&
    typeof o.sessionId === 'string' &&
    typeof o.apiText === 'string' &&
    typeof o.firestoreText === 'string' &&
    typeof o.displayName === 'string' &&
    typeof o.reasoningEnabled === 'boolean' &&
    typeof o.legacyApi === 'boolean' &&
    typeof o.attempt === 'number' &&
    typeof o.nextAttemptAtMs === 'number' &&
    typeof o.createdAtMs === 'number' &&
    typeof o.userDocWritten === 'boolean'
  );
}

export async function loadPendingSendQueue(): Promise<PendingSendEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

export async function savePendingSendQueue(entries: PendingSendEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[pendingSendQueue] savePendingSendQueue failed — estado em memória continua válido', err);
  }
}
