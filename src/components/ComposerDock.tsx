import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Barra do composer no fluxo flex (não absolute — evita overlap com mensagens). */
export function ComposerDock({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const bottomPad = keyboardHeight > 0 ? 6 : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.dock, { paddingBottom: bottomPad }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    paddingTop: 6,
  },
});
