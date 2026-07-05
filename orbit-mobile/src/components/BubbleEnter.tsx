import React, { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticBubbleLand } from '../lib/haptics';
import { fade, motion, springs } from '../lib/motionTokens';

interface Props {
  role: 'user' | 'luna';
  animate?: boolean;
  children: React.ReactNode;
}

/** Entrada de bolha — slide + fade + scale com mola (pop suave, estilo iMessage). */
export function BubbleEnter({ role, animate = true, children }: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const slideFrom = role === 'user' ? motion.bubbleSlideUserPx : motion.bubbleSlideLunaPx;
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const played = useRef(false);

  // useLayoutEffect: aplica o estado inicial (fade/slide) antes do paint,
  // evitando o flash de 1 frame com a bolha já no estado final.
  useLayoutEffect(() => {
    running.current?.stop();
    running.current = null;

    const shouldAnimate = animate && interactions && !reduceMotion && !played.current;
    if (!shouldAnimate) {
      opacity.setValue(1);
      translateX.setValue(0);
      scale.setValue(1);
      return;
    }

    played.current = true;
    hapticBubbleLand();

    opacity.setValue(0.85);
    translateX.setValue(slideFrom);
    scale.setValue(motion.bubbleScaleFrom);

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: fade.bubbleMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, { toValue: 0, ...springs.bubble, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, ...springs.bubble, useNativeDriver: true }),
    ]);

    running.current = anim;
    anim.start(({ finished }) => {
      if (finished) running.current = null;
    });

    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [animate, interactions, opacity, reduceMotion, scale, slideFrom, translateX]);

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ translateX }, { scale }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
