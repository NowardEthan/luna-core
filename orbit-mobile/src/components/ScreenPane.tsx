import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { fade, motion, screenPushDistance, springs } from '../lib/motionTokens';

export type ScreenEnterMode = 'none' | 'push' | 'pushQuick';

interface Props {
  visible: boolean;
  /** Incrementa ao abrir conversa — re-dispara a animação. */
  enterKey?: number;
  enterMode?: ScreenEnterMode;
  children: React.ReactNode;
}

/**
 * Painel full-screen — push com mola (estilo iOS) ao abrir; voltar ao menu é instantâneo.
 * Transform (translateX + scale) via `Animated.spring` para "respirar"; opacity via timing.
 */
export function ScreenPane({ visible, enterKey = 0, enterMode = 'none', children }: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const snap = () => {
    opacity.setValue(1);
    translateX.setValue(0);
    scale.setValue(1);
  };

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  // useLayoutEffect: estado inicial antes do paint (sem flash de 1 frame).
  useLayoutEffect(() => {
    running.current?.stop();
    running.current = null;

    if (!visible) {
      snap();
      return;
    }

    const shouldAnimate =
      enterMode !== 'none' && enterKey > 0 && interactions && !reduceMotion;

    if (!shouldAnimate) {
      snap();
      return;
    }

    const quick = enterMode === 'pushQuick';
    const spring = quick ? springs.screenQuick : springs.screen;
    const slide = screenPushDistance(quick ? 'pushQuick' : 'push');
    const fadeMs = quick ? fade.screenQuickMs : fade.screenMs;

    opacity.setValue(motion.screenOpacityFrom);
    translateX.setValue(slide);
    scale.setValue(motion.screenScaleFrom);

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: fadeMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, { toValue: 0, ...spring, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, ...spring, useNativeDriver: true }),
    ]);

    running.current = anim;
    anim.start(({ finished }) => {
      if (finished) running.current = null;
    });

    return () => {
      running.current?.stop();
      running.current = null;
    };
  }, [enterKey, enterMode, interactions, opacity, reduceMotion, scale, translateX, visible]);

  if (!mounted) return null;

  const animating = visible && enterMode !== 'none' && enterKey > 0;

  return (
    <Animated.View
      style={[
        styles.pane,
        visible ? styles.visible : styles.hidden,
        animating ? { opacity, transform: [{ translateX }, { scale }] } : undefined,
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pane: {
    ...StyleSheet.absoluteFillObject,
  },
  visible: {
    display: 'flex',
    zIndex: 2,
  },
  hidden: {
    display: 'none',
    zIndex: 1,
  },
});
