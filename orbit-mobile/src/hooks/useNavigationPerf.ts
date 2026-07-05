import { useRef } from 'react';
import { InteractionManager } from 'react-native';

/** Congela props pesadas enquanto a tela está escondida (ex.: thread no menu). */
export function useFrozenWhenHidden<T>(visible: boolean, value: T): T {
  const frozen = useRef(value);
  if (visible) {
    frozen.current = value;
  }
  return visible ? value : frozen.current;
}

/** Executa trabalho pesado depois da transição de UI. */
export function runAfterTransition(task: () => void) {
  requestAnimationFrame(() => {
    InteractionManager.runAfterInteractions(task);
  });
}
