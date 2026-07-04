import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { motion, springs } from '../lib/motionTokens';
import { useMotionProfile } from './useMotionProfile';

interface PressSpring {
  scale: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
  /** false quando reduce-motion está ativo — usa opacidade em vez de escala. */
  enabled: boolean;
}

/** Feedback de toque com mola — encolhe ao premir, volta com física orgânica. */
export function usePressSpring(scaleTo: number = motion.pressScale): PressSpring {
  const { interactions } = useMotionProfile();
  const scale = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const springTo = useCallback(
    (value: number) => {
      running.current?.stop();
      const anim = Animated.spring(scale, {
        toValue: value,
        ...springs.press,
        useNativeDriver: true,
      });
      running.current = anim;
      anim.start(({ finished }) => {
        if (finished) running.current = null;
      });
    },
    [scale],
  );

  const onPressIn = useCallback(() => {
    if (interactions) springTo(scaleTo);
  }, [interactions, scaleTo, springTo]);

  const onPressOut = useCallback(() => {
    if (interactions) springTo(1);
  }, [interactions, springTo]);

  return { scale, onPressIn, onPressOut, enabled: interactions };
}
