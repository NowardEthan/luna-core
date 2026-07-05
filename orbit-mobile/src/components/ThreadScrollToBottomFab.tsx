import React, { memo, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useMotionProfile } from '../hooks/useMotionProfile';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  loading?: boolean;
  onPress: () => void;
}

/** Atalho flutuante — volta ao fundo da thread (mensagens recentes). */
export const ThreadScrollToBottomFab = memo(function ThreadScrollToBottomFab({
  visible,
  loading = false,
  onPress,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const show = visible ? 1 : 0;
    if (!interactions || reduceMotion) {
      opacity.setValue(show);
      lift.setValue(show ? 0 : 12);
      scale.setValue(show ? 1 : 0.92);
      return;
    }

    Animated.parallel([
      Animated.spring(opacity, { toValue: show, ...springs.press, useNativeDriver: true }),
      Animated.spring(lift, { toValue: show ? 0 : 12, ...springs.bubble, useNativeDriver: true }),
      Animated.spring(scale, { toValue: show ? 1 : 0.92, ...springs.press, useNativeDriver: true }),
    ]).start();
  }, [interactions, lift, opacity, reduceMotion, scale, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        {
          opacity,
          transform: [{ translateY: lift }, { scale }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ir para mensagens recentes"
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Ionicons name="chevron-down" size={20} color={tokens.textHigh} />
        {loading ? <View style={styles.loadingDot} /> : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    bottom: 10,
    zIndex: 12,
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 24, 31, 0.92)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(99, 140, 255, 0.35)',
    ...(Platform.OS === 'android'
      ? { elevation: 6 }
      : {
          shadowColor: tokens.accent,
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  loadingDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.accentBright,
    borderWidth: 1.5,
    borderColor: tokens.ink1,
  },
});
