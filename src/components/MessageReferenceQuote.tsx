import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { MessageReference } from '../lib/messageReference';
import { referenceAuthorLabel } from '../lib/messageReference';
import { tokens } from '../theme/tokens';

interface Props {
  reference: MessageReference;
  /** Dentro da bolha azul do usuário. */
  variant?: 'user-bubble';
  onPress?: () => void;
}

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/** Trecho citado embutido na bolha — cartão inseto com barra lateral. */
export const MessageReferenceQuote = memo(function MessageReferenceQuote({
  reference,
  variant = 'user-bubble',
  onPress,
}: Props) {
  const isLuna = reference.role === 'luna';
  const codeLike = excerptLooksLikeCode(reference.excerpt);
  const interactive = !!onPress;

  const card = (
    <View style={styles.card}>
      <View style={[styles.accentBar, isLuna ? styles.accentBarLuna : styles.accentBarUser]} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Ionicons
            name={isLuna ? 'sparkles' : 'person'}
            size={12}
            color="rgba(255,255,255,0.82)"
          />
          <Text style={styles.author}>{referenceAuthorLabel(reference)}</Text>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>#{reference.messageIndex}</Text>
          </View>
          {interactive ? (
            <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.55)" />
          ) : null}
        </View>
        <Text
          style={[styles.excerpt, codeLike ? styles.excerptCode : styles.excerptProse]}
          numberOfLines={4}
        >
          {stripWrappingQuotes(reference.excerpt)}
        </Text>
      </View>
    </View>
  );

  return (
    <View
      style={[styles.wrap, variant === 'user-bubble' && styles.wrapUserBubble]}
      accessibilityLabel={`Referência a ${referenceAuthorLabel(reference)} número ${reference.messageIndex}`}
    >
      {interactive ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityHint="Abre e destaca a mensagem citada na conversa"
        >
          {card}
        </Pressable>
      ) : (
        card
      )}
    </View>
  );
});

function stripWrappingQuotes(text: string): string {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith('“') && t.endsWith('”')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Termos técnicos curtos, inline code ou identificadores — estilo chip/monospace. */
function excerptLooksLikeCode(text: string): boolean {
  const t = stripWrappingQuotes(text).trim();
  if (!t) return false;
  if (/^`[^`\n]+`$/.test(t)) return true;
  if (/^(const|let|var|function|import|export|class|def|SELECT|INSERT|UPDATE)\b/.test(t)) return true;
  if (t.includes('\n') && /[{;=>]/.test(t)) return true;
  if (t.length <= 40 && /^[\w\-./:\\+#]+$/.test(t) && /[\dA-Z]|[-_.]/.test(t)) return true;
  return false;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  wrapUserBubble: {
    marginBottom: 10,
  },
  pressable: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  pressed: {
    opacity: 0.88,
  },
  card: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    minWidth: 0,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  accentBarLuna: {
    backgroundColor: 'rgba(136, 193, 242, 0.95)',
  },
  accentBarUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  author: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  indexBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  indexText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  excerpt: {
    flexShrink: 1,
    color: 'rgba(255, 255, 255, 0.94)',
    fontSize: 13,
    lineHeight: 18,
  },
  excerptProse: {
    fontStyle: 'italic',
  },
  excerptCode: {
    fontFamily: mono,
    fontSize: 12.5,
    lineHeight: 17,
    fontStyle: 'normal',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: tokens.chipFg,
    overflow: 'hidden',
  },
});
