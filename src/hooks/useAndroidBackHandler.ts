import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Intercepta o botão/gesto «voltar» no Android.
 * Regista por ordem LIFO — o último handler activo tem prioridade.
 * Devolve `true` quando o evento foi consumido.
 */
export function useAndroidBackHandler(
  handler: () => boolean,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handlerRef.current(),
    );
    return () => subscription.remove();
  }, [enabled]);
}
