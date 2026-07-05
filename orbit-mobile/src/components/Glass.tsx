import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  radius?: number;
  intensity?: number;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}

const glassStyle = (radius: number, strong: boolean): ViewStyle => ({
  borderRadius: radius,
  overflow: 'hidden',
  borderWidth: StyleSheet.hairlineWidth * 2,
  borderColor: tokens.glassBorder,
  backgroundColor: strong ? tokens.glassStrong : tokens.glass,
});

export function Glass({ children, radius = 18, intensity = 28, strong = false, style }: Props) {
  const base = [glassStyle(radius, strong), style];

  if (Platform.OS === 'android') {
    return <View style={base}>{children}</View>;
  }

  return (
    <BlurView intensity={intensity} tint="dark" style={base}>
      {children}
    </BlurView>
  );
}
