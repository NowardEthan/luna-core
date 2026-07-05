import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { tokens } from '../theme/tokens';

interface Props {
  compact?: boolean;
  whisper?: string;
}

function OrbitRing({
  radius,
  size,
  durationMs,
  reverse,
}: {
  radius: number;
  size: number;
  durationMs: number;
  reverse?: boolean;
}) {
  const { decorativeMotion } = useMotionProfile();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!decorativeMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [decorativeMotion, durationMs, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.orbitRing, { transform: [{ rotate }] }]}>
      <View
        style={[
          styles.particle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ translateX: radius }],
          },
        ]}
      />
    </Animated.View>
  );
}

/** Lua pensando — eclipse + partículas em órbita (Orbit concept). */
export function LunarPulse({
  compact = true,
  whisper = 'reunindo luz',
}: Props) {
  const { decorativeMotion, reduceMotion, snappy } = useMotionProfile();
  const staticMotion = !decorativeMotion || reduceMotion;
  const breatheMs = snappy ? 1750 : 2100;
  const stage = compact ? 44 : 52;
  const moonInset = compact ? 8 : 10;
  const moonSize = stage - moonInset * 2;

  const haloScale = useRef(new Animated.Value(0.92)).current;
  const haloOpacity = useRef(new Animated.Value(0.5)).current;
  const eclipse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (staticMotion) {
      haloScale.setValue(1);
      haloOpacity.setValue(0.7);
      eclipse.setValue(0.45);
      return;
    }

    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(haloScale, { toValue: 1.1, duration: breatheMs, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.95, duration: breatheMs, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(haloScale, { toValue: 0.9, duration: breatheMs, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.45, duration: breatheMs, useNativeDriver: true }),
        ]),
      ]),
    );

    const eclipseLoop = Animated.loop(
      Animated.timing(eclipse, {
        toValue: 1,
        duration: 5500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );

    haloLoop.start();
    eclipseLoop.start();
    return () => {
      haloLoop.stop();
      eclipseLoop.stop();
    };
  }, [breatheMs, eclipse, haloOpacity, haloScale, staticMotion]);

  const eclipseX = eclipse.interpolate({
    inputRange: [0, 0.45, 0.55, 1],
    outputRange: [-moonSize * 0.95, moonSize * 0.08, moonSize * 0.18, moonSize * 1.05],
  });

  const particleRadius = compact ? 18 : 22;

  return (
    <View style={[styles.root, compact && styles.rootCompact]} accessibilityRole="progressbar">
      <View style={[styles.stage, { width: stage, height: stage }]}>
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
        {!staticMotion ? (
          <>
            <OrbitRing radius={particleRadius} size={3} durationMs={7000} />
            <OrbitRing radius={particleRadius - 4} size={2} durationMs={11000} reverse />
            <OrbitRing radius={particleRadius + 2} size={2} durationMs={15000} />
          </>
        ) : null}
        <View
          style={[
            styles.moon,
            {
              width: moonSize,
              height: moonSize,
              borderRadius: moonSize / 2,
              top: moonInset,
              left: moonInset,
            },
          ]}
        >
          <View style={[styles.moonLit, { borderRadius: moonSize / 2 }]} />
          <Animated.View
            style={[
              styles.eclipse,
              {
                width: moonSize * 0.78,
                borderRadius: moonSize / 2,
                transform: [{ translateX: eclipseX }],
              },
            ]}
          />
        </View>
      </View>
      {whisper ? (
        <View style={styles.whisperWrap}>
          <Text style={styles.whisper} key={whisper}>
            {whisper}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rootCompact: {
    gap: 8,
    paddingVertical: 2,
  },
  stage: {
    position: 'relative',
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -4,
    borderRadius: 999,
    backgroundColor: 'rgba(75, 117, 242, 0.18)',
  },
  orbitRing: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    backgroundColor: tokens.accentBright,
    shadowColor: tokens.accent,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  moon: {
    position: 'absolute',
    overflow: 'hidden',
    shadowColor: tokens.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  moonLit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#D8DCE8',
  },
  eclipse: {
    position: 'absolute',
    top: '-8%',
    bottom: '-8%',
    backgroundColor: '#12151C',
    opacity: 0.88,
  },
  whisperWrap: {
    flex: 1,
    minWidth: 0,
  },
  whisper: {
    fontSize: 11,
    color: tokens.textLow,
    letterSpacing: 1.2,
    textTransform: 'lowercase',
  },
});
