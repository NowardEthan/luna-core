import { useEffect, useRef, useState } from 'react';
import { Dimensions, Platform } from 'react-native';

import { useKeyboardHeight } from './useKeyboardHeight';

/** Debounce ao fechar — evita reset de inset por keyboardDidHide espúrio (Android). */
const HIDE_DEBOUNCE_MS = 120;

/** Janela encolheu o suficiente → adjustResize activo, não duplicar inset. */
const RESIZE_SHRINK_RATIO = 0.35;

/**
 * Inset inferior para o ComposerDock (Home, Thread).
 * Android: `max(0, keyboardHeight - shrink)` — só preenche o que o resize não cobriu.
 * iOS: altura do teclado, travada ao abrir.
 * Nunca usar no root do shell — evita duplo inset + flicker do IME.
 */
export function useComposerKeyboardInset(): number {
  const keyboardHeight = useKeyboardHeight();
  const [inset, setInset] = useState(0);
  const baselineRef = useRef(Dimensions.get('window').height);
  const latchedRef = useRef(false);

  useEffect(() => {
    if (keyboardHeight > 0) {
      if (latchedRef.current) return;

      let cancelled = false;
      let attempts = 0;

      const latch = () => {
        if (cancelled || latchedRef.current) return;

        if (Platform.OS === 'ios') {
          setInset(keyboardHeight);
          latchedRef.current = true;
          return;
        }

        const winH = Dimensions.get('window').height;
        const shrink = Math.max(0, baselineRef.current - winH);
        const resizeHandled = shrink > keyboardHeight * RESIZE_SHRINK_RATIO;

        // Espera o adjustResize estabilizar; se não vier, usa altura total do teclado.
        if (!resizeHandled && attempts < 3) {
          attempts += 1;
          requestAnimationFrame(latch);
          return;
        }

        setInset(Math.max(0, keyboardHeight - shrink));
        latchedRef.current = true;
      };

      requestAnimationFrame(latch);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      setInset(0);
      latchedRef.current = false;
      baselineRef.current = Dimensions.get('window').height;
    }, HIDE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [keyboardHeight]);

  return inset;
}

/** @deprecated Use useComposerKeyboardInset */
export function useHomeKeyboardBottomInset(): number {
  return useComposerKeyboardInset();
}

/** @deprecated Use useComposerKeyboardInset */
export function useKeyboardBottomInset(): number {
  return useComposerKeyboardInset();
}

/** Teclado aberto? Debounce curto ao fechar — evita layout saltando mid-keystroke. */
export function useKeyboardOpen(): boolean {
  const keyboardHeight = useKeyboardHeight();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (keyboardHeight > 0) {
      setOpen(true);
      return;
    }

    const timer = setTimeout(() => setOpen(false), HIDE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyboardHeight]);

  return open;
}
