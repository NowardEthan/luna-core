import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, type TextStyle } from 'react-native';
import { splitStableActiveWord } from '../../lib/streamWordBuffer';
import { useMotionProfile } from '../../hooks/useMotionProfile';

type Props = {
  text: string;
  /** Quando false, todo o texto fica estável (fim do stream). */
  streaming?: boolean;
  style?: TextStyle | TextStyle[];
  muted?: boolean;
};

const REVEAL_MS = 220;

function ActiveWord({
  word,
  animate,
  style,
  muted,
}: {
  word: string;
  animate: boolean;
  style?: TextStyle | TextStyle[];
  muted?: boolean;
}) {
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animate ? 4 : 0)).current;
  const blurOpacity = useRef(new Animated.Value(animate ? 0.35 : 0)).current;

  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      translateY.setValue(0);
      blurOpacity.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(4);
    blurOpacity.setValue(0.35);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: REVEAL_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: REVEAL_MS, useNativeDriver: true }),
      Animated.timing(blurOpacity, { toValue: 0, duration: REVEAL_MS, useNativeDriver: true }),
    ]).start();
  }, [animate, blurOpacity, opacity, translateY, word]);

  if (!word) return null;

  const baseStyle = [styles.word, style, muted ? styles.muted : undefined];

  return (
    <Animated.Text style={[...baseStyle, { opacity, transform: [{ translateY }] }]}>
      {Platform.OS === 'ios' ? (
        <>
          <Animated.Text
            style={[
              StyleSheet.absoluteFillObject,
              ...baseStyle,
              styles.blurGhost,
              { opacity: blurOpacity },
            ]}
          >
            {word}
          </Animated.Text>
          {word}
        </>
      ) : (
        <>
          <Animated.Text style={[...baseStyle, styles.blurGhost, { opacity: blurOpacity }]}>
            {word}
          </Animated.Text>
          {word}
        </>
      )}
    </Animated.Text>
  );
}

export function StreamWordReveal({ text, streaming = false, style, muted = false }: Props) {
  const { reduceMotion } = useMotionProfile();
  const { stable, active } = splitStableActiveWord(text);
  const showActive = streaming && active.length > 0;
  const instant = reduceMotion || !streaming;

  return (
    <Text style={[styles.container, style, muted ? styles.muted : undefined]}>
      {stable ? <Text style={style}>{stable}</Text> : null}
      {showActive ? (
        <ActiveWord word={active} animate={!instant} style={style} muted={muted} />
      ) : !streaming && active ? (
        <Text style={style}>{active}</Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  word: {
    flexShrink: 1,
  },
  muted: {
    opacity: 0.55,
  },
  blurGhost: {
    position: 'relative',
    top: 1,
    left: 1,
  },
});
