import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  loadPendingSendQueue,
  savePendingSendQueue,
  nextBackoffMs,
  MAX_SEND_ATTEMPTS,
  type PendingSendEntry,
} from '../lib/pendingSendQueue';

const SAVE_DEBOUNCE_MS = 280;

/**
 * Fila de envios pendentes — sobrevive ao fechamento do app (AsyncStorage,
 * mesmo padrão de debounce + flush em background do usePersistedDraft).
 */
export function usePendingSendQueue() {
  const queueRef = useRef<PendingSendEntry[]>([]);
  const readyRef = useRef(false);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await savePendingSendQueue(queueRef.current);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void savePendingSendQueue(queueRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const ensureReady = useCallback(async () => {
    if (readyRef.current) return;
    if (!readyPromiseRef.current) {
      readyPromiseRef.current = loadPendingSendQueue().then((loaded) => {
        queueRef.current = loaded;
        readyRef.current = true;
      });
    }
    await readyPromiseRef.current;
  }, []);

  useEffect(() => {
    void ensureReady();
  }, [ensureReady]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        void flush();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [flush]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const enqueue = useCallback(
    async (entry: PendingSendEntry) => {
      await ensureReady();
      queueRef.current = [...queueRef.current.filter((e) => e.userMessageId !== entry.userMessageId), entry];
      scheduleSave();
    },
    [ensureReady, scheduleSave],
  );

  const markUserDocWritten = useCallback(
    async (userMessageId: string) => {
      await ensureReady();
      queueRef.current = queueRef.current.map((e) =>
        e.userMessageId === userMessageId ? { ...e, userDocWritten: true } : e,
      );
      scheduleSave();
    },
    [ensureReady, scheduleSave],
  );

  /** Registra falha, calcula backoff; ao esgotar tentativas, remove da fila e sinaliza desistência. */
  const markAttemptFailed = useCallback(
    async (userMessageId: string): Promise<{ gaveUp: boolean }> => {
      await ensureReady();
      const current = queueRef.current.find((e) => e.userMessageId === userMessageId);
      if (!current) return { gaveUp: true };

      const attempt = current.attempt + 1;
      if (attempt >= MAX_SEND_ATTEMPTS) {
        queueRef.current = queueRef.current.filter((e) => e.userMessageId !== userMessageId);
        scheduleSave();
        return { gaveUp: true };
      }

      queueRef.current = queueRef.current.map((e) =>
        e.userMessageId === userMessageId
          ? { ...e, attempt, nextAttemptAtMs: Date.now() + nextBackoffMs(attempt) }
          : e,
      );
      scheduleSave();
      return { gaveUp: false };
    },
    [ensureReady, scheduleSave],
  );

  const remove = useCallback(
    async (userMessageId: string) => {
      await ensureReady();
      queueRef.current = queueRef.current.filter((e) => e.userMessageId !== userMessageId);
      scheduleSave();
    },
    [ensureReady, scheduleSave],
  );

  const entriesForSession = useCallback(
    async (sessionId: string): Promise<PendingSendEntry[]> => {
      await ensureReady();
      return queueRef.current
        .filter((e) => e.sessionId === sessionId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
    [ensureReady],
  );

  return { enqueue, markUserDocWritten, markAttemptFailed, remove, entriesForSession, flush };
}

export type PendingSendQueue = ReturnType<typeof usePendingSendQueue>;
