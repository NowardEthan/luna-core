import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { MessageActionFeedback } from '../lib/messageActions';
import { tokens } from '../theme/tokens';

interface Props {
  feedback: MessageActionFeedback | null;
}

/** Banner de feedback — alinhado com Orbit DS/Chat/MessageActionFeedback. */
export function MessageActionToast({ feedback }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (!feedback) {
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [feedback, opacity, translateY]);

  if (!feedback) return null;

  return (
    <Animated.View
      style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.pill, styles[feedback.kind] ?? styles.copy]}>
        <Text style={styles.title}>{feedback.title}</Text>
        <Text style={styles.detail} numberOfLines={2}>
          {feedback.detail}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 40,
    alignItems: 'center',
  },
  pill: {
    maxWidth: 360,
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    backgroundColor: 'rgba(18, 22, 32, 0.92)',
  },
  title: {
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  detail: {
    color: tokens.textMid,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  copy: {},
  resend: {},
  redo: {},
  fork: {},
  branch: {},
  truncate: {},
  reference: {},
});
