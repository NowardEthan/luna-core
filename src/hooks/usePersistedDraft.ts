import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { loadDraft, saveDraft } from '../lib/draftStorage';

const SAVE_DEBOUNCE_MS = 280;

/** Troca de âmbito instantânea — evita flash ao alternar home ↔ thread. */
const scopeDraftMemory = new Map<string, string>();

/**
 * Rascunho persistido por âmbito (home ou sessionId).
 * Grava em AsyncStorage com debounce + flush em background.
 */
export function usePersistedDraft(scope: string) {
  const [draft, setDraftState] = useState('');
  const draftRef = useRef('');
  const scopeRef = useRef(scope);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);

  const flush = useCallback(async (text?: string) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveDraft(scopeRef.current, text ?? draftRef.current);
  }, []);

  const scheduleSave = useCallback((text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveDraft(scopeRef.current, text);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const setDraft = useCallback(
    (value: string | ((prev: string) => string)) => {
      setDraftState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        draftRef.current = next;
        if (readyRef.current) scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const clearDraft = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    draftRef.current = '';
    scopeDraftMemory.set(scopeRef.current, '');
    setDraftState('');
    await saveDraft(scopeRef.current, '');
  }, []);

  // Troca de âmbito: memória primeiro, AsyncStorage em background.
  useEffect(() => {
    let active = true;
    const prevScope = scopeRef.current;

    const run = async () => {
      if (prevScope !== scope) {
        scopeDraftMemory.set(prevScope, draftRef.current);
        void saveDraft(prevScope, draftRef.current);
      }

      scopeRef.current = scope;

      if (scopeDraftMemory.has(scope)) {
        const mem = scopeDraftMemory.get(scope)!;
        draftRef.current = mem;
        setDraftState(mem);
        readyRef.current = true;
        return;
      }

      readyRef.current = false;
      const loaded = await loadDraft(scope);
      if (!active) return;
      scopeDraftMemory.set(scope, loaded);
      draftRef.current = loaded;
      setDraftState(loaded);
      readyRef.current = true;
    };

    void run();

    return () => {
      active = false;
    };
  }, [scope]);

  // Flush ao ir para background (pouca RAM / kill da app).
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

  return { draft, setDraft, clearDraft, flush, draftRef };
}

export type PersistedDraft = ReturnType<typeof usePersistedDraft>;
