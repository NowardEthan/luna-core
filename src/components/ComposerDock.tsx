import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useComposerKeyboardInset, useKeyboardOpen } from '../hooks/useKeyboardBottomInset';
import { layout } from '../theme/layout';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Barra do composer no fluxo flex (nunca `position: absolute`).
 * Inset do teclado aqui — Android: só o que adjustResize não cobriu; iOS: altura total.
 */
export function ComposerDock({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const keyboardInset = useComposerKeyboardInset();

  const bottomPad = keyboardOpen
    ? keyboardInset
    : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.dock, { paddingBottom: bottomPad }, style]}>
      {children}
    </View>
  );
}

/** Alinha com `layout.composerPaddingX` — barra mais larga que o scroll acima. */
const styles = StyleSheet.create({
  dock: {
    paddingTop: 6,
    paddingHorizontal: layout.composerPaddingX,
    overflow: 'visible',
  },
});
