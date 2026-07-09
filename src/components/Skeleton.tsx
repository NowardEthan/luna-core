import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useMotionProfile } from '../hooks/useMotionProfile';
import { tokens } from '../theme/tokens';

interface Props {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloco placeholder sólido com shimmer sutil (desliga se `decorativeMotion` for false). */
export function Skeleton({ width = '100%', height, radius = 8, style }: Props) {
  const { decorativeMotion } = useMotionProfile();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!decorativeMotion) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [decorativeMotion, shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  return (
    <View style={[{ width, height, borderRadius: radius }, styles.base, style]}>
      {decorativeMotion ? (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={['transparent', tokens.surfaceHover, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const BUBBLE_WIDTHS: Array<{ align: 'flex-start' | 'flex-end'; width: `${number}%` }> = [
  { align: 'flex-start', width: '62%' },
  { align: 'flex-end', width: '46%' },
  { align: 'flex-start', width: '74%' },
];

/** Placeholder de 3 bolhas alternadas, usado enquanto o histórico da thread carrega. */
export function SkeletonMessageList() {
  return (
    <View style={listStyles.wrap}>
      {BUBBLE_WIDTHS.map((row, i) => (
        <View key={i} style={[listStyles.row, { alignItems: row.align }]}>
          <Skeleton width={row.width} height={18} radius={20} />
        </View>
      ))}
    </View>
  );
}

const listStyles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 18 },
  row: { width: '100%' },
});

/** Placeholder de grid de fotos, usado enquanto a galeria carrega o primeiro lote. */
export function SkeletonPhotoGrid({ columns, gap }: { columns: number; gap: number }) {
  const cells = Array.from({ length: columns * 4 });
  return (
    <View style={[gridStyles.wrap, { gap }]}>
      {cells.map((_, i) => (
        <Skeleton
          key={i}
          width={`${100 / columns - 1}%` as `${number}%`}
          radius={10}
          style={{ aspectRatio: 1, flexGrow: 1, minWidth: `${100 / columns - 2}%` }}
        />
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 12 },
});

const styles = StyleSheet.create({
  base: {
    backgroundColor: tokens.surface,
    overflow: 'hidden',
  },
});
