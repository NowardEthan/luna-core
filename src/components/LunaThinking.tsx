import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LunaBubbleShell } from './LunaBubbleShell';
import { LunarPulse } from './LunarPulse';
import { useMotionProfile } from '../hooks/useMotionProfile';

/** Whispers cósmicos — igual Orbit concept (orbit-cosmic). */
const WHISPERS = ['reunindo luz', 'orbitando ideias', 'compondo resposta'] as const;

export function LunaThinking() {
  const motion = useMotionProfile();
  const [whisperIndex, setWhisperIndex] = useState(0);

  useEffect(() => {
    if (!motion.decorativeMotion) return;
    const id = setInterval(() => {
      setWhisperIndex((i) => (i + 1) % WHISPERS.length);
    }, motion.snappy ? 3000 : 3500);
    return () => clearInterval(id);
  }, [motion.decorativeMotion, motion.snappy]);

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel="Luna pensando">
      <LunaBubbleShell firstInGroup thinking compact>
        <LunarPulse compact whisper={WHISPERS[whisperIndex]} />
      </LunaBubbleShell>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    marginBottom: 4,
    paddingRight: 28,
  },
});
