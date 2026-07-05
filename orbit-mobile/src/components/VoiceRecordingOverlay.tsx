import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { tokens } from '../theme/tokens';
import { type VoiceHoldUi } from './voiceUi';
import { VoiceWaveform } from './VoiceWaveform';

interface Props {
  ui: VoiceHoldUi;
}

/** Barra de gravação estilo WhatsApp — timer à esquerda, hint ao centro. */
export function VoiceRecordingOverlay({ ui }: Props) {
  const { decorativeMotion } = useMotionProfile();
  const [mounted, setMounted] = useState(ui.active);

  const opacity = useRef(new Animated.Value(0)).current;
  const hintSlide = useRef(new Animated.Value(0)).current;
  const chevronNudge = useRef(new Animated.Value(0)).current;
  const cancelTint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ui.active) {
      setMounted(true);
      hintSlide.setValue(14);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(hintSlide, {
          toValue: 0,
          friction: 8,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [hintSlide, opacity, ui.active]);

  useEffect(() => {
    if (!ui.active || ui.willCancel || ui.locked || !decorativeMotion) {
      chevronNudge.stopAnimation();
      chevronNudge.setValue(0);
      return;
    }

    const nudge = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronNudge, {
          toValue: -4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(chevronNudge, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    nudge.start();
    return () => nudge.stop();
  }, [chevronNudge, decorativeMotion, ui.active, ui.locked, ui.willCancel]);

  useEffect(() => {
    Animated.timing(cancelTint, {
      toValue: ui.willCancel ? 0.5 : 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [cancelTint, ui.willCancel]);

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.cancelTint, { opacity: cancelTint }]} />

      {/* Esquerda: mic + timer (+ waveform se bloqueado) */}
      <View style={styles.left}>
        <Ionicons
          name="mic"
          size={20}
          color={ui.willCancel ? '#F87171' : '#EF4444'}
        />
        <Text style={[styles.time, ui.willCancel && styles.timeCancel]}>
          {formatVoiceDuration(ui.durationMs)}
        </Text>
        {ui.locked && <VoiceWaveform active={ui.active} cancelTone={ui.willCancel} />}
      </View>

      {/* Centro: deslize para cancelar */}
      {!ui.locked && (
        <Animated.View
          style={[
            styles.center,
            {
              transform: [{ translateX: chevronNudge }],
              opacity: ui.willLock ? 0.35 : 1,
            },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={ui.willCancel ? '#F87171' : tokens.textLow}
          />
          <Text style={[styles.hint, ui.willCancel && styles.hintCancel]}>
            {ui.willCancel ? 'Solte para cancelar' : 'Deslize para cancelar'}
          </Text>
        </Animated.View>
      )}

      {ui.locked && (
        <View style={styles.center}>
          {ui.willCancel ? (
            <>
              <Ionicons name="chevron-back" size={18} color="#F87171" />
              <Text style={[styles.hint, styles.hintCancel]}>Solte para apagar</Text>
            </>
          ) : (
            <Text style={styles.lockedHint}>Toque para enviar · segure para apagar</Text>
          )}
        </View>
      )}

      <View style={styles.rightPad} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    zIndex: 2,
  },
  cancelTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 113, 113, 0.06)',
    borderRadius: 22,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  time: {
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  timeCancel: {
    color: '#F87171',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  hint: {
    color: tokens.textMid,
    fontSize: 15,
    fontWeight: '400',
  },
  hintCancel: {
    color: '#F87171',
    fontWeight: '500',
  },
  lockedHint: {
    color: tokens.textMid,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  rightPad: {
    width: 58,
  },
});
