import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { ChatMessage } from '../data/fixtures';

/** Janela progressiva — fundo primeiro, histórico ao subir. */
export const THREAD_WINDOW = {
  /** Mensagens visíveis ao abrir (~2 telas no fundo). */
  initial: 14,
  /** Quantas mensagens antigas revelar por expansão. */
  expandBy: 12,
  /** Só ativa janela acima deste total. */
  minTotal: 18,
  /** Distância (px) antes do topo carregado para expandir silenciosamente. */
  prefetchPx: 560,
  /** Cooldown entre expansões durante scroll rápido. */
  expandCooldownMs: 100,
} as const;

interface WindowResult {
  visibleMessages: ChatMessage[];
  hasOlderHidden: boolean;
  hiddenCount: number;
  windowingActive: boolean;
  expandWindow: () => void;
  onListScroll: (contentOffsetY: number, contentHeight: number, layoutHeight: number) => void;
}

export function useProgressiveThreadWindow(
  sessionKey: string | null,
  messages: ChatMessage[],
  enabled: boolean,
  ensureVisibleMessageId?: string | null,
): WindowResult {
  const [visibleCount, setVisibleCount] = useState<number>(THREAD_WINDOW.initial);
  const expandingRef = useRef(false);
  const lastExpandAt = useRef(0);
  const totalRef = useRef(messages.length);
  totalRef.current = messages.length;

  useEffect(() => {
    setVisibleCount(THREAD_WINDOW.initial);
    expandingRef.current = false;
    lastExpandAt.current = 0;
  }, [sessionKey]);

  const total = messages.length;
  const windowingActive = enabled && total >= THREAD_WINDOW.minTotal;

  const visibleMessages = useMemo(() => {
    if (!windowingActive) return messages;

    let count = Math.min(visibleCount, total);
    if (ensureVisibleMessageId) {
      const idx = messages.findIndex((m) => m.id === ensureVisibleMessageId);
      if (idx >= 0) {
        const needed = total - idx;
        count = Math.max(count, needed);
      }
    }
    return messages.slice(-count);
  }, [ensureVisibleMessageId, messages, total, visibleCount, windowingActive]);

  const hiddenCount = windowingActive ? total - visibleMessages.length : 0;
  const hasOlderHidden = hiddenCount > 0;

  const expandWindow = useCallback(() => {
    if (!hasOlderHidden || expandingRef.current) return;

    expandingRef.current = true;
    InteractionManager.runAfterInteractions(() => {
      setVisibleCount((current) =>
        Math.min(current + THREAD_WINDOW.expandBy, totalRef.current),
      );
      expandingRef.current = false;
    });
  }, [hasOlderHidden]);

  const onListScroll = useCallback(
    (contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
      if (!hasOlderHidden) return;

      const now = Date.now();
      if (now - lastExpandAt.current < THREAD_WINDOW.expandCooldownMs) return;

      const maxOffset = Math.max(0, contentHeight - layoutHeight);
      const distanceFromTop = maxOffset - contentOffsetY;

      if (distanceFromTop < THREAD_WINDOW.prefetchPx) {
        lastExpandAt.current = now;
        expandWindow();
      }
    },
    [expandWindow, hasOlderHidden],
  );

  return {
    visibleMessages,
    hasOlderHidden,
    hiddenCount,
    windowingActive,
    expandWindow,
    onListScroll,
  };
}

/** Calcula firstInGroup considerando mensagem oculta imediatamente acima. */
export function threadRowFirstInGroup(
  messages: ChatMessage[],
  visibleMessages: ChatMessage[],
  indexInVisible: number,
): boolean {
  const globalStart = messages.length - visibleMessages.length;
  if (indexInVisible === 0 && globalStart > 0) {
    return messages[globalStart - 1]?.role !== visibleMessages[0]?.role;
  }
  return visibleMessages[indexInVisible - 1]?.role !== visibleMessages[indexInVisible]?.role;
}
