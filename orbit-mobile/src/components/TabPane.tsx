import React, { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { fade, motion, springs } from '../lib/motionTokens';

interface Props {
  visible: boolean;
  enterDirection?: number;
  /** Incrementa a cada troca — garante que a aba ativa fica sempre por cima. */
  stackOrder?: number;
  children: React.ReactNode;
}

/** Painel de aba — fade + slide ao entrar; esconde instantaneamente ao sair. */
export function TabPane({ visible, enterDirection = 0, stackOrder = 0, children }: Props) {
  const { tabTransitions } = useMotionProfile();
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const stopAnim = () => {
    running.current?.stop();
    running.current = null;
  };

  // useLayoutEffect: define o estado inicial antes do paint (sem flash de 1 frame).
  useLayoutEffect(() => {
    stopAnim();

    if (!visible) {
      opacity.setValue(0);
      translateX.setValue(0);
      return;
    }

    if (!tabTransitions) {
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }

    const slide = enterDirection * motion.tabSlidePx;
    opacity.setValue(0.9);
    translateX.setValue(slide);

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: fade.tabMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, { toValue: 0, ...springs.tab, useNativeDriver: true }),
    ]);

    running.current = anim;
    anim.start(({ finished }) => {
      if (finished) running.current = null;
    });

    return stopAnim;
  }, [enterDirection, opacity, tabTransitions, translateX, visible]);

  return (
    <Animated.View
      style={[
        styles.pane,
        visible ? styles.paneVisible : styles.paneHidden,
        visible && {
          opacity,
          transform: [{ translateX }],
          zIndex: stackOrder,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pane: {
    ...StyleSheet.absoluteFillObject,
  },
  paneVisible: {
    display: 'flex',
  },
  paneHidden: {
    display: 'none',
    opacity: 0,
    zIndex: 0,
  },
});
