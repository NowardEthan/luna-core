import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { tokens } from '../theme/tokens';

interface Props {
  variant?: 'home' | 'thread';
}

/**
 * Fundo Orbit estático — gradiente + nebula SVG (sem animação).
 * Memoizado e independente da tela ativa: nunca re-renderiza ao navegar,
 * evitando o flicker de re-rasterização do SVG na troca home ↔ thread.
 */
function OrbitBackgroundInner({ variant = 'home' }: Props) {
  const { width, height } = useWindowDimensions();

  const intensity = variant === 'thread' ? 0.48 : 1;
  const auraY = variant === 'home' ? height * 0.38 : height * 0.32;
  const auraSize = width * 1.35;
  const auraTop = auraY - auraSize / 2;

  return (
    <>
      <LinearGradient
        colors={[tokens.ink2, tokens.ink1, tokens.ink0]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={styles.auraHost}>
        <Svg width={auraSize} height={auraSize} style={{ marginTop: auraTop, opacity: 0.9 * intensity }}>
          <Defs>
            <RadialGradient id="orbitAura" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tokens.accentBright} stopOpacity={0.22 * intensity} />
              <Stop offset="0.22" stopColor={tokens.accent} stopOpacity={0.32 * intensity} />
              <Stop offset="0.5" stopColor={tokens.accentMid} stopOpacity={0.14 * intensity} />
              <Stop offset="1" stopColor={tokens.accentDeep} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={auraSize / 2} cy={auraSize / 2} r={auraSize / 2} fill="url(#orbitAura)" />
        </Svg>
      </View>
    </>
  );
}

export const OrbitBackground = React.memo(OrbitBackgroundInner);

const styles = StyleSheet.create({
  auraHost: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
});
