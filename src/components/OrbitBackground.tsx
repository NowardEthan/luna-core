import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';

interface Props {
  variant?: 'home' | 'thread';
}

/**
 * Fundo minimalista — só um gradiente escuro sutil (ink1 → ink0), sem a aura/glow
 * radial que destoava do flat solid do resto do app. `variant` mantido por
 * compatibilidade de API (não muda mais o visual).
 */
function OrbitBackgroundInner(_props: Props) {
  return (
    <LinearGradient
      colors={[tokens.ink1, tokens.ink0]}
      style={StyleSheet.absoluteFill}
    />
  );
}

export const OrbitBackground = React.memo(OrbitBackgroundInner);
