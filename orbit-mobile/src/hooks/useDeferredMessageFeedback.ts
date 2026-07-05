import { useCallback, useEffect, useRef, useState } from 'react';

import type { MessageActionFeedback } from '../lib/messageActions';
import { MESSAGE_FEEDBACK_MS } from '../lib/messageActions';

/** Adia toasts de ação enquanto o teclado estiver aberto (usuário digitando). */
export function useDeferredMessageFeedback(keyboardOpen: boolean) {
  const [feedback, setFeedback] = useState<MessageActionFeedback | null>(null);
  const pendingRef = useRef<MessageActionFeedback | null>(null);

  const pushFeedback = useCallback(
    (next: MessageActionFeedback) => {
      if (keyboardOpen) {
        pendingRef.current = next;
        return;
      }
      setFeedback(next);
    },
    [keyboardOpen],
  );

  useEffect(() => {
    if (keyboardOpen || !pendingRef.current) return;
    setFeedback(pendingRef.current);
    pendingRef.current = null;
  }, [keyboardOpen]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), MESSAGE_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  return { feedback, pushFeedback, setFeedback };
}
