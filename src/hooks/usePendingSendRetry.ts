import { useCallback, useEffect, useRef } from 'react';

import { useNetworkStatus } from './useNetworkStatus';
import type { PendingSendEntry } from '../lib/pendingSendQueue';
import type { PendingSendQueue } from './usePendingSendQueue';

const FALLBACK_INTERVAL_MS = 5_000;

type Params = {
  activeSessionId: string | null;
  loading: boolean;
  pendingQueue: PendingSendQueue;
  sendPendingEntry: (entry: PendingSendEntry) => Promise<void>;
};

/**
 * Motor de drenagem da fila de envios pendentes. Três gatilhos (montagem /
 * troca de sessão, borda de reconexão do NetInfo, intervalo de 5s) drenam a
 * `activeSessionId` sequencialmente — `loading` já é o mutex de `callLuna`,
 * então nunca dispara duas tentativas em paralelo.
 */
export function usePendingSendRetry({ activeSessionId, loading, pendingQueue, sendPendingEntry }: Params) {
  const { connected } = useNetworkStatus();
  const drainingRef = useRef(false);
  const loadingRef = useRef(loading);
  const prevConnectedRef = useRef(connected);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const drain = useCallback(
    async (sessionId: string, ignoreBackoff: boolean) => {
      if (drainingRef.current || loadingRef.current) return;
      drainingRef.current = true;
      try {
        const entries = await pendingQueue.entriesForSession(sessionId);
        const now = Date.now();
        for (const entry of entries) {
          if (loadingRef.current) break;
          if (!ignoreBackoff && entry.nextAttemptAtMs > now) continue;
          await sendPendingEntry(entry);
        }
      } finally {
        drainingRef.current = false;
      }
    },
    [pendingQueue, sendPendingEntry],
  );

  // Montagem / troca de sessão — ignora backoff antigo (é de uma instância morta do app).
  useEffect(() => {
    if (!activeSessionId) return;
    void drain(activeSessionId, true);
  }, [activeSessionId, drain]);

  // Borda de reconexão — torna quedas rápidas invisíveis, pulando o backoff pendente.
  useEffect(() => {
    if (!activeSessionId) {
      prevConnectedRef.current = connected;
      return;
    }
    if (!prevConnectedRef.current && connected) {
      void drain(activeSessionId, true);
    }
    prevConnectedRef.current = connected;
  }, [connected, activeSessionId, drain]);

  // Fallback — cobre falha do lado do servidor, não só do dispositivo.
  useEffect(() => {
    if (!activeSessionId) return;
    const id = setInterval(() => {
      void drain(activeSessionId, false);
    }, FALLBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeSessionId, drain]);
}
