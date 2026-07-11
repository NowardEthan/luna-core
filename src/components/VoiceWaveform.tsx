import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { tokens } from '../theme/tokens';

const BAR_COUNT = 5;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MAX_H = 18;

/** Barras de áudio — scaleY nativo (sem animar height). */
export function VoiceWaveform({ active, cancelTone = false }: { active: boolean; cancelTone?: boolean }) {
  const { decorativeMotion } = useMotionProfile();
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.25))).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.25));
      return;
    }

    if (!decorativeMotion) {
      bars.forEach((b, i) => b.setValue(0.45 + (i % 3) * 0.15));
      return;
    }

    const loops = bars.map((bar, i) => {
      const peak = 0.55 + (i % 3) * 0.18;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 70),
          Animated.timing(bar, {
            toValue: peak,
            duration: 280 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.2,
            duration: 280 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars, decorativeMotion]);

  return (
    <View style={styles.row}>
      {bars.map((bar, i) => (
        <View key={i} style={styles.barSlot}>
          <Animated.View
            style={[
              styles.bar,
              cancelTone && styles.barCancel,
              { transform: [{ scaleY: bar }] },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    height: MAX_H,
    marginLeft: 4,
  },
  barSlot: {
    width: BAR_WIDTH,
    height: MAX_H,
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_WIDTH,
    height: MAX_H,
    borderRadius: BAR_WIDTH,
    backgroundColor: tokens.error,
    opacity: 0.9,
  },
  barCancel: {
    backgroundColor: tokens.error,
  },
});
