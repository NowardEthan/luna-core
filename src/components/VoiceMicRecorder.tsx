import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CANCEL_SLIDE_PX,
  IDLE_VOICE_UI,
  LOCK_SLIDE_PX,
  type VoiceHoldUi,
} from './voiceUi';
import { VoiceClip } from '../data/fixtures';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { tokens } from '../theme/tokens';

export interface VoiceMicRecorderRef {
  finishLocked: () => Promise<void>;
  cancelLocked: () => Promise<void>;
}

interface Props {
  onVoiceResult: (clip: VoiceClip) => void;
  onUiChange: (ui: VoiceHoldUi) => void;
  disabled?: boolean;
}

const BTN_IDLE = 42;
const BTN_RECORD = 54;
const IDLE_SCALE = BTN_IDLE / BTN_RECORD;
const TAP_MS = 250;

function shouldCancel(dx: number) {
  return dx < -CANCEL_SLIDE_PX;
}

/** Mic flutuante — segura, segue o dedo, desliza ← cancelar, ↑ bloquear (WhatsApp). */
export const VoiceMicRecorder = forwardRef<VoiceMicRecorderRef, Props>(function VoiceMicRecorder(
  { onVoiceResult, onUiChange, disabled = false },
  ref,
) {
  const { durationMs, start, cancel, finish } = useVoiceRecording();
  const { decorativeMotion } = useMotionProfile();
  const [willCancel, setWillCancel] = useState(false);
  const [willLock, setWillLock] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockedHolding, setLockedHolding] = useState(false);

  const holdingRef = useRef(false);
  const lockedRef = useRef(false);
  const lockedHoldingRef = useRef(false);
  const willCancelRef = useRef(false);
  const willLockRef = useRef(false);
  const startingRef = useRef(false);
  const releaseWhileStartingRef = useRef(false);
  const holdStartMsRef = useRef(0);
  const slideDxRef = useRef(0);

  const floatX = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const growScale = useRef(new Animated.Value(IDLE_SCALE)).current;
  const lockPillOpacity = useRef(new Animated.Value(0)).current;
  const lockPillScale = useRef(new Animated.Value(0.85)).current;
  const recordPulse = useRef(new Animated.Value(1)).current;

  const onVoiceResultRef = useRef(onVoiceResult);
  const onUiChangeRef = useRef(onUiChange);
  const handlersRef = useRef({ start, cancel, finish, disabled, durationMs });
  onVoiceResultRef.current = onVoiceResult;
  onUiChangeRef.current = onUiChange;
  handlersRef.current = { start, cancel, finish, disabled, durationMs };

  const emitUi = (patch: Partial<VoiceHoldUi>) => {
    onUiChangeRef.current({
      active: holdingRef.current || lockedRef.current,
      willCancel: willCancelRef.current,
      willLock: willLockRef.current,
      locked: lockedRef.current,
      durationMs: handlersRef.current.durationMs,
      slideDx: slideDxRef.current,
      slideDy: 0,
      ...patch,
    });
  };

  const springFloatHome = () => {
    Animated.parallel([
      Animated.spring(floatX, { toValue: 0, friction: 6, tension: 180, useNativeDriver: true }),
      Animated.spring(floatY, { toValue: 0, friction: 6, tension: 180, useNativeDriver: true }),
    ]).start();
  };

  const resetUi = () => {
    holdingRef.current = false;
    lockedRef.current = false;
    lockedHoldingRef.current = false;
    willCancelRef.current = false;
    willLockRef.current = false;
    slideDxRef.current = 0;
    setIsHolding(false);
    setWillCancel(false);
    setWillLock(false);
    setLocked(false);
    setLockedHolding(false);
    floatX.setValue(0);
    floatY.setValue(0);
    lockPillOpacity.setValue(0);
    lockPillScale.setValue(0.85);
    growScale.setValue(IDLE_SCALE);
    onUiChangeRef.current(IDLE_VOICE_UI);
  };

  const finishAndSend = async () => {
    const clip = await handlersRef.current.finish();
    resetUi();
    if (clip) onVoiceResultRef.current(clip);
  };

  /** Para gravação e limpa UI — descarta o áudio. */
  const cancelRecording = async () => {
    resetUi();
    await handlersRef.current.cancel();
  };

  useImperativeHandle(ref, () => ({
    finishLocked: finishAndSend,
    cancelLocked: cancelRecording,
  }));

  const engageLock = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    willLockRef.current = false;
    willCancelRef.current = false;
    slideDxRef.current = 0;
    setLocked(true);
    setWillLock(false);
    setWillCancel(false);
    holdingRef.current = false;
    setIsHolding(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    springFloatHome();
    Animated.parallel([
      Animated.timing(lockPillOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.spring(growScale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
    ]).start();
    emitUi({ locked: true, willLock: false, willCancel: false, slideDx: 0, slideDy: 0, active: true });
  };

  const setCancelState = (cancelled: boolean) => {
    if (cancelled === willCancelRef.current) return;
    willCancelRef.current = cancelled;
    setWillCancel(cancelled);
    void Haptics.impactAsync(
      cancelled ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
  };

  const applyHorizontalSlide = (dx: number) => {
    const clampedX = Math.min(0, Math.max(-140, dx));
    slideDxRef.current = clampedX;
    floatX.setValue(clampedX);
    setCancelState(shouldCancel(clampedX));
    return clampedX;
  };

  const updateGesture = (dx: number, dy: number) => {
    if (lockedRef.current) return;

    const clampedX = applyHorizontalSlide(dx);
    const clampedY = Math.min(0, Math.max(-110, dy));
    floatY.setValue(clampedY);

    const locking = clampedY <= LOCK_SLIDE_PX;
    if (locking !== willLockRef.current) {
      willLockRef.current = locking;
      setWillLock(locking);
      if (locking) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const lockHint = Math.min(1, Math.max(0, -clampedY / 50));
    lockPillOpacity.setValue(lockHint);
    lockPillScale.setValue(0.85 + lockHint * 0.15);

    if (locking) {
      engageLock();
      return;
    }

    emitUi({
      active: true,
      willCancel: willCancelRef.current,
      willLock: locking,
      slideDx: clampedX,
      slideDy: clampedY,
    });
  };

  const updateLockedDiscard = (dx: number) => {
    const clampedX = applyHorizontalSlide(dx);
    emitUi({
      locked: true,
      active: true,
      willCancel: willCancelRef.current,
      slideDx: clampedX,
    });
  };

  const endLockedHold = async () => {
    const dx = slideDxRef.current;
    const elapsed = Date.now() - holdStartMsRef.current;
    const discarding = willCancelRef.current || shouldCancel(dx);
    const isTap = !discarding && elapsed < TAP_MS && Math.abs(dx) < 12;

    lockedHoldingRef.current = false;
    setLockedHolding(false);
    floatX.setValue(0);
    slideDxRef.current = 0;

    if (isTap) {
      willCancelRef.current = false;
      setWillCancel(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await finishAndSend();
      return;
    }

    if (discarding) {
      willCancelRef.current = false;
      setWillCancel(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await cancelRecording();
      return;
    }

    willCancelRef.current = false;
    setWillCancel(false);
    emitUi({ locked: true, active: true, willCancel: false, slideDx: 0 });
  };

  const endRecordHold = async () => {
    const discarding = willCancelRef.current || shouldCancel(slideDxRef.current);

    if (discarding) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await cancelRecording();
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await finishAndSend();
  };

  const gesturesRef = useRef({
    updateGesture,
    updateLockedDiscard,
    endLockedHold,
    endRecordHold,
    resetUi,
    engageLock,
  });
  gesturesRef.current = {
    updateGesture,
    updateLockedDiscard,
    endLockedHold,
    endRecordHold,
    resetUi,
    engageLock,
  };

  useEffect(() => {
    if (!isHolding && !locked) {
      recordPulse.setValue(1);
      return;
    }
    if (!decorativeMotion) {
      recordPulse.setValue(1.03);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, {
          toValue: 1.05,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(recordPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [decorativeMotion, isHolding, locked, recordPulse]);

  useEffect(() => {
    if (!holdingRef.current && !lockedRef.current) return;
    emitUi({ active: true, durationMs });
  }, [durationMs]);

  const recordPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !handlersRef.current.disabled && !lockedRef.current,
      onMoveShouldSetPanResponder: () =>
        (holdingRef.current || startingRef.current) && !lockedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (handlersRef.current.disabled || lockedRef.current) return;

        releaseWhileStartingRef.current = false;
        startingRef.current = true;
        holdingRef.current = true;
        slideDxRef.current = 0;
        setIsHolding(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        Animated.spring(growScale, {
          toValue: 1,
          friction: 6,
          tension: 220,
          useNativeDriver: true,
        }).start();

        void (async () => {
          const { start: startRec, cancel: cancelRec } = handlersRef.current;
          const ok = await startRec();
          startingRef.current = false;

          if (releaseWhileStartingRef.current) {
            if (ok) await cancelRec();
            gesturesRef.current.resetUi();
            return;
          }
          if (!ok) {
            gesturesRef.current.resetUi();
            return;
          }

          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          emitUi({ active: true, willCancel: false, willLock: false, slideDx: 0, slideDy: 0 });
        })();
      },
      onPanResponderMove: (_, gesture) => {
        if (lockedRef.current) return;
        gesturesRef.current.updateGesture(gesture.dx, gesture.dy);
      },
      onPanResponderRelease: () => {
        if (lockedRef.current) return;
        if (startingRef.current) {
          releaseWhileStartingRef.current = true;
          return;
        }
        if (!holdingRef.current) return;
        void gesturesRef.current.endRecordHold();
      },
      onPanResponderTerminate: () => {
        if (lockedRef.current) return;
        if (startingRef.current) {
          releaseWhileStartingRef.current = true;
          return;
        }
        if (!holdingRef.current) return;
        gesturesRef.current.resetUi();
        void handlersRef.current.cancel();
      },
    }),
  ).current;

  const lockedPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => lockedRef.current && !handlersRef.current.disabled,
      onMoveShouldSetPanResponder: () => lockedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (!lockedRef.current) return;
        holdStartMsRef.current = Date.now();
        lockedHoldingRef.current = true;
        slideDxRef.current = 0;
        setLockedHolding(true);
        willCancelRef.current = false;
        setWillCancel(false);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        emitUi({ locked: true, active: true, willCancel: false, slideDx: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        if (!lockedRef.current) return;
        gesturesRef.current.updateLockedDiscard(gesture.dx);
      },
      onPanResponderRelease: () => {
        if (!lockedRef.current) return;
        void gesturesRef.current.endLockedHold();
      },
      onPanResponderTerminate: () => {
        if (!lockedRef.current || !lockedHoldingRef.current) return;
        lockedHoldingRef.current = false;
        setLockedHolding(false);
        floatX.setValue(0);
        slideDxRef.current = 0;
        willCancelRef.current = false;
        setWillCancel(false);
        emitUi({ locked: true, active: true, willCancel: false, slideDx: 0 });
      },
    }),
  ).current;

  const recording = isHolding || locked;
  const pulse = recording && !lockedHolding ? recordPulse : 1;
  const combinedScale = Animated.multiply(growScale, pulse);
  const panHandlers = locked ? lockedPan.panHandlers : recordPan.panHandlers;

  const buttonColors: [string, string] = willCancel
    ? ['#F87171', '#DC2626']
    : locked || recording
      ? [tokens.accentBright, tokens.accent]
      : [tokens.accentMid, tokens.accentDeep];

  const iconName = locked ? (willCancel ? 'trash' : 'send') : 'mic';

  return (
    <View style={styles.slot} pointerEvents="box-none">
      {recording && !locked && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lockPill,
            {
              opacity: lockPillOpacity,
              transform: [
                { translateX: floatX },
                { translateY: Animated.add(floatY, -58) },
                { scale: lockPillScale },
              ],
            },
          ]}
        >
          <Ionicons name="lock-open-outline" size={18} color={tokens.textMid} />
          <Ionicons name="chevron-up" size={16} color={tokens.textLow} style={styles.lockChevron} />
        </Animated.View>
      )}

      <Animated.View
        {...panHandlers}
        style={[
          styles.floating,
          {
            transform: [
              { translateX: floatX },
              { translateY: locked ? 0 : floatY },
              { scale: combinedScale },
            ],
          },
        ]}
        accessibilityLabel={
          locked
            ? willCancel
              ? 'Solte para apagar gravação'
              : 'Toque para enviar, segure e deslize para apagar'
            : 'Pressione e segure para gravar mensagem de voz'
        }
        accessibilityRole="button"
      >
        <LinearGradient
          colors={buttonColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientFill}
        >
          <Ionicons name={iconName} size={20} color={tokens.onAccent} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  slot: {
    width: BTN_RECORD + 8,
    height: BTN_RECORD + 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 20,
  },
  floating: {
    width: BTN_RECORD,
    height: BTN_RECORD,
    borderRadius: BTN_RECORD / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  gradientFill: {
    flex: 1,
    width: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockPill: {
    position: 'absolute',
    width: 44,
    height: 72,
    borderRadius: 22,
    backgroundColor: tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  lockChevron: {
    marginTop: -2,
  },
});
