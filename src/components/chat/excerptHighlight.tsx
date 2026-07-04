import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { tokens } from '../../theme/tokens';

export type ExcerptRange = { start: number; end: number };

/** Localiza o trecho citado no texto da mensagem (exact → case-insensitive). */
export function findExcerptRange(text: string, excerpt: string | undefined): ExcerptRange | null {
  const needle = excerpt?.trim();
  if (!needle || !text) return null;

  let start = text.indexOf(needle);
  if (start >= 0) return { start, end: start + needle.length };

  const lower = text.toLowerCase();
  const ne = needle.toLowerCase();
  start = lower.indexOf(ne);
  if (start >= 0) return { start, end: start + needle.length };

  return null;
}

export type ExcerptTextPart = { text: string; highlighted: boolean };

export function splitTextWithExcerpt(
  text: string,
  excerpt: string | undefined,
): ExcerptTextPart[] {
  const range = findExcerptRange(text, excerpt);
  if (!range) return [{ text, highlighted: false }];

  const parts: ExcerptTextPart[] = [];
  if (range.start > 0) parts.push({ text: text.slice(0, range.start), highlighted: false });
  parts.push({ text: text.slice(range.start, range.end), highlighted: true });
  if (range.end < text.length) parts.push({ text: text.slice(range.end), highlighted: false });
  return parts;
}

export const excerptHighlightStyle: TextStyle = {
  backgroundColor: 'rgba(99, 140, 255, 0.42)',
  color: tokens.textHigh,
  borderRadius: 4,
  overflow: 'hidden',
};

interface HighlightTextProps {
  text: string;
  excerpt?: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: TextStyle;
  /** Pulso suave enquanto o destaque está activo. */
  pulse?: boolean;
}

/** Texto com o trecho referenciado realçado. */
export function ExcerptHighlightText({
  text,
  excerpt,
  style,
  highlightStyle = excerptHighlightStyle,
  pulse = false,
}: HighlightTextProps) {
  const parts = useMemo(() => splitTextWithExcerpt(text, excerpt), [text, excerpt]);
  const hasHighlight = parts.some((p) => p.highlighted);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse || !hasHighlight) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.72, duration: 680, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 680, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, hasHighlight, pulse]);

  if (!hasHighlight) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.highlighted ? (
          <Animated.Text
            key={i}
            style={[style, highlightStyle, pulse ? { opacity: anim } : null]}
          >
            {part.text}
          </Animated.Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        ),
      )}
    </Text>
  );
}

/** Indica se o trecho aparece dentro de um bloco (ex.: code fence). */
export function excerptInCodeBlock(content: string, excerpt: string | undefined): boolean {
  const needle = excerpt?.trim();
  if (!needle || !content) return false;
  const re = /```[^\n]*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (findExcerptRange(m[1], needle)) return true;
  }
  return false;
}

export const excerptHighlightStyles = StyleSheet.create({
  inlineCodeMatch: {
    backgroundColor: 'rgba(99, 140, 255, 0.48)',
    borderColor: 'rgba(136, 193, 242, 0.55)',
  },
});
