import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useMotionProfile } from '../hooks/useMotionProfile';
import {
  HUMOR_TEMA_COR,
  type LunaHumorBadge as LunaHumorBadgeType,
  type LunaHumorTema,
} from '../lib/lunaHumor';
import { tokens } from '../theme/tokens';

interface Props {
  humor: LunaHumorBadgeType;
  /** Ao lado do nome na bolha da Luna. */
  inline?: boolean;
}

function useHumorAliveMotion(tema: LunaHumorTema, active: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    scale.setValue(1);
    rotate.setValue(0);
    opacity.setValue(1);
    translateX.setValue(0);

    if (!active) return;

    const easeInOut = Easing.inOut(Easing.sin);

    let loop: Animated.CompositeAnimation;

    switch (tema) {
      case 'animado':
        loop = Animated.loop(
          Animated.sequence([
            Animated.spring(scale, { toValue: 1.18, friction: 4, tension: 180, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
            Animated.delay(280),
          ]),
        );
        break;
      case 'caloroso':
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.1, duration: 900, easing: easeInOut, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 900, easing: easeInOut, useNativeDriver: true }),
          ]),
        );
        break;
      case 'chateado':
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(translateX, { toValue: 1.5, duration: 70, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: -1.5, duration: 70, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: 1, duration: 60, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: 0, duration: 60, useNativeDriver: true }),
            Animated.delay(420),
          ]),
        );
        break;
      case 'magoado':
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(rotate, { toValue: 1, duration: 2200, easing: easeInOut, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -1, duration: 2200, easing: easeInOut, useNativeDriver: true }),
          ]),
        );
        break;
      case 'contido':
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.72, duration: 1600, easing: easeInOut, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 1600, easing: easeInOut, useNativeDriver: true }),
          ]),
        );
        break;
      case 'neutro':
      default:
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.05, duration: 1400, easing: easeInOut, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 1400, easing: easeInOut, useNativeDriver: true }),
          ]),
        );
        break;
    }

    loopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [active, opacity, rotate, scale, tema, translateX]);

  const rotateDeg = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-4deg', '4deg'],
  });

  return { scale, opacity, translateX, rotateDeg };
}

/** Badge de humor — clima + relação; animação leve por tema. */
export const LunaHumorBadge = memo(function LunaHumorBadge({ humor, inline = false }: Props) {
  const { decorativeMotion, reduceMotion } = useMotionProfile();
  const accent = HUMOR_TEMA_COR[humor.tema] ?? tokens.textMid;
  const animate = inline && decorativeMotion && !reduceMotion;
  const motion = useHumorAliveMotion(humor.tema, animate);

  const emojiNode = (
    <Animated.Text
      style={[
        styles.emoji,
        inline && styles.emojiInline,
        animate && {
          transform: [
            { scale: motion.scale },
            { translateX: motion.translateX },
            { rotate: motion.rotateDeg },
          ],
          opacity: motion.opacity,
        },
      ]}
      accessibilityElementsHidden
    >
      {humor.emoji}
    </Animated.Text>
  );

  if (inline) {
    return (
      <View
        style={[styles.inlineChip, { borderColor: `${accent}44`, backgroundColor: `${accent}14` }]}
        accessibilityRole="text"
        accessibilityLabel={humor.accessibilityLabel}
      >
        {emojiNode}
        <Text style={[styles.inlineLabel, { color: accent }]} numberOfLines={1}>
          {humor.label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.pill, { borderColor: `${accent}55` }]}
      accessibilityRole="text"
      accessibilityLabel={humor.accessibilityLabel}
    >
      {emojiNode}
      <Text style={[styles.label, { color: accent }]} numberOfLines={1}>
        {humor.label}
      </Text>
      {humor.narrativa ? (
        <Text style={styles.narrativa} numberOfLines={2}>
          {humor.narrativa}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  inlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    maxWidth: 120,
  },
  emoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  emojiInline: {
    fontSize: 12,
    lineHeight: 15,
  },
  inlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    textTransform: 'lowercase',
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 22, 32, 0.72)',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  narrativa: {
    width: '100%',
    fontSize: 11,
    lineHeight: 15,
    color: tokens.textLow,
    marginTop: 2,
  },
});
