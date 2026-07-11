import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { tokens } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  radius?: number;
  /** @deprecated Mantido só por compatibilidade — não há mais blur. */
  intensity?: number;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Superfície do app. Antes era "glass" (BlurView frosted no iOS, translúcido no
 * Android) — ilegível e destoando do resto. Agora é **flat solid**: um cartão
 * opaco com `tokens.surface`, igual à Home/Definições. Nome e API mantidos para
 * não mexer nos chamadores.
 */
export function Glass({ children, radius = 18, strong = false, style }: Props) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tokens.borderSubtle,
          backgroundColor: strong ? tokens.surfaceRaised : tokens.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
