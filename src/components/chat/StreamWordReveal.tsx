import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import {
  STREAM_FADE_LIFT_PX,
  STREAM_FADE_MS,
  tokenizeStreamSegments,
} from '../../lib/streamWordBuffer';
import { useMotionProfile } from '../../hooks/useMotionProfile';

type Props = {
  text: string;
  /** Quando true, revela progressivamente; false = texto estático. */
  streaming?: boolean;
  style?: TextStyle | TextStyle[];
  muted?: boolean;
};

function FadeWord({
  text,
  style,
  muted,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  muted?: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const targetOpacity = muted ? 0.55 : 1;
  const isWhitespace = /^\s+$/.test(text);
  const fadeMs = isWhitespace ? 180 : STREAM_FADE_MS;
  const liftPx = isWhitespace ? 0 : STREAM_FADE_LIFT_PX;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: fadeMs,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [fadeMs, progress]);

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetOpacity],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [liftPx, 0],
  });

  return (
    <Animated.View style={[styles.wordWrap, { opacity, transform: [{ translateY }] }]}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

/**
 * Revela palavra a palavra. Só monta segmentos já revelados (o texto completo
 * nunca entra no DOM de uma vez). Opacidade em View — fiável no Android;
 * Animated.Text aninhado ignora opacity e mostrava tudo de imediato.
 */
/** Palavras reveladas há mais de ACTIVE_WINDOW passos viram texto estático — evita acumular um Animated.Value por palavra em respostas longas. */
const ACTIVE_WINDOW = 40;

export function StreamWordReveal({ text, streaming = false, style, muted = false }: Props) {
  const { reduceMotion } = useMotionProfile();
  const segments = useMemo(() => tokenizeStreamSegments(text), [text]);
  const total = segments.length;

  const shouldAnimate = streaming && !reduceMotion && total > 0;

  if (!shouldAnimate) {
    return (
      <Text style={[styles.container, style, muted ? styles.mutedText : undefined]}>{text}</Text>
    );
  }

  // Real-time: renderiza TUDO que já chegou do servidor (o texto cresce token a
  // token via onContentDelta). Sem stagger artificial nem orçamento de 5s — cada
  // palavra recém-chegada só ganha um fade curto ao entrar; as antigas viram
  // texto estático. O que aparece na tela acompanha o que o modelo já gerou.
  const settledCount = Math.max(0, total - ACTIVE_WINDOW);
  const settled = segments.slice(0, settledCount);
  const active = segments.slice(settledCount);

  return (
    <View style={styles.container}>
      <View style={styles.flow}>
        {settled.length > 0 ? (
          <Text style={[style, muted ? styles.mutedText : undefined]}>{settled.join('')}</Text>
        ) : null}
        {active.map((segment, idx) => (
          <FadeWord key={`w-${settledCount + idx}`} text={segment} style={style} muted={muted} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  wordWrap: {
    flexShrink: 0,
  },
  mutedText: {
    opacity: 0.55,
  },
});
