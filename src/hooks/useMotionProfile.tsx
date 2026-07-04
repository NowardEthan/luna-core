import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export interface MotionProfile {
  /** Preferência do sistema (Reduce motion). */
  reduceMotion: boolean;
  /** Android — mesmas animações, timings ligeiramente mais curtos. */
  snappy: boolean;
  /** Micro-interacções (press, tabs, composer). */
  interactions: boolean;
  /** Transições entre abas. */
  tabTransitions: boolean;
  /** Respiração da nebula / fundo. */
  ambientMotion: boolean;
  /** Partículas, whispers, loops decorativos. */
  decorativeMotion: boolean;
}

const DEFAULT_PROFILE: MotionProfile = {
  reduceMotion: false,
  snappy: Platform.OS === 'android',
  interactions: true,
  tabTransitions: true,
  ambientMotion: true,
  decorativeMotion: true,
};

const MotionProfileContext = createContext<MotionProfile>(DEFAULT_PROFILE);

export function MotionProfileProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const profile = useMemo<MotionProfile>(() => {
    if (reduceMotion) {
      return {
        reduceMotion: true,
        snappy: true,
        interactions: false,
        tabTransitions: false,
        ambientMotion: false,
        decorativeMotion: false,
      };
    }

    return {
      reduceMotion: false,
      snappy: Platform.OS === 'android',
      interactions: true,
      tabTransitions: true,
      ambientMotion: true,
      decorativeMotion: true,
    };
  }, [reduceMotion]);

  return (
    <MotionProfileContext.Provider value={profile}>{children}</MotionProfileContext.Provider>
  );
}

export function useMotionProfile(): MotionProfile {
  return useContext(MotionProfileContext);
}
