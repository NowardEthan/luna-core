import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

type ComposerSessionControls = {
  setFocused: (focused: boolean) => void;
  setAttachOpen: (open: boolean) => void;
  setVoiceActive: (active: boolean) => void;
};

const ControlsContext = createContext<ComposerSessionControls | null>(null);

/** No-op estável — o Composer regista foco/anexo/voz sem re-render global. */
const noopControls: ComposerSessionControls = {
  setFocused: () => {},
  setAttachOpen: () => {},
  setVoiceActive: () => {},
};

/**
 * Provider leve para o Composer — não esconde chrome global.
 * Estabilidade do teclado: inset no ComposerDock; Android usa adjustResize.
 */
export function ComposerSessionProvider({ children }: { children: ReactNode }) {
  const controls = useMemo(() => noopControls, []);

  return <ControlsContext.Provider value={controls}>{children}</ControlsContext.Provider>;
}

/** @deprecated Não esconder UI com isto. Use useKeyboardOpen() para layout opcional. */
export function useComposerEngaged(): boolean {
  return false;
}

/** Só para o componente Composer e sheets de anexo/voz. */
export function useComposerSessionControls(): ComposerSessionControls {
  const ctx = useContext(ControlsContext);
  if (!ctx) {
    throw new Error('useComposerSessionControls requer ComposerSessionProvider');
  }
  return ctx;
}
