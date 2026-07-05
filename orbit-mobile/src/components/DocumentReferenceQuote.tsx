import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { DocumentReference } from '../lib/messageReference';
import { formatFileExtension } from '../lib/composerAttachmentModel';
import { tokens } from '../theme/tokens';

interface Props {
  reference: DocumentReference;
  variant?: 'user-bubble' | 'luna-bubble';
  onPress?: () => void;
}

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const DocumentReferenceQuote = memo(function DocumentReferenceQuote({
  reference,
  variant = 'user-bubble',
  onPress,
}: Props) {
  const ext = formatFileExtension(reference.attachmentName);
  const interactive = !!onPress;
  const inUserBubble = variant === 'user-bubble';

  const card = (
    <View style={[styles.card, inUserBubble ? styles.cardUser : styles.cardLuna]}>
      <View style={[styles.accentBar, inUserBubble ? styles.accentBarUser : styles.accentBarLuna]} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Ionicons
            name="document-text"
            size={13}
            color={inUserBubble ? 'rgba(255,255,255,0.88)' : tokens.accentBright}
          />
          <Text style={[styles.docLabel, inUserBubble && styles.docLabelUser]} numberOfLines={1}>
            {reference.attachmentName}
          </Text>
          <View style={styles.extBadge}>
            <Text style={styles.extText}>{ext}</Text>
          </View>
          {interactive ? (
            <Ionicons
              name="open-outline"
              size={13}
              color={inUserBubble ? 'rgba(255,255,255,0.55)' : tokens.textLow}
            />
          ) : null}
        </View>
        <Text
          style={[
            styles.excerpt,
            excerptLooksLikeCode(reference.excerpt) ? styles.excerptCode : styles.excerptProse,
            inUserBubble && styles.excerptUser,
          ]}
          numberOfLines={4}
        >
          {stripWrappingQuotes(reference.excerpt)}
        </Text>
        <Text style={[styles.footer, inUserBubble && styles.footerUser]}>
          Mensagem #{reference.messageIndex}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.wrap, inUserBubble && styles.wrapUserBubble]}>
      {interactive ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityHint="Abre o documento e destaca o trecho citado"
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

function excerptLooksLikeCode(text: string): boolean {
  const t = stripWrappingQuotes(text).trim();
  if (!t) return false;
  if (/^`[^`\n]+`$/.test(t)) return true;
  if (t.length <= 48 && /^[\w\-./:\\+#]+$/.test(t) && /[\dA-Z]|[-_.]/.test(t)) return true;
  return false;
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  wrapUserBubble: { marginBottom: 10 },
  pressable: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  pressed: { opacity: 0.88 },
  card: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    minWidth: 0,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  cardUser: {
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    borderColor: 'rgba(255, 210, 120, 0.28)',
  },
  cardLuna: {
    backgroundColor: 'rgba(255, 193, 120, 0.08)',
    borderColor: 'rgba(255, 193, 120, 0.22)',
  },
  accentBar: { width: 3, alignSelf: 'stretch' },
  accentBarUser: { backgroundColor: 'rgba(255, 193, 120, 0.92)' },
  accentBarLuna: { backgroundColor: 'rgba(255, 193, 120, 0.75)' },
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
    gap: 6,
  },
  docLabel: {
    flex: 1,
    color: tokens.accentBright,
    fontSize: 12,
    fontWeight: '700',
  },
  docLabelUser: { color: 'rgba(255, 255, 255, 0.92)' },
  extBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 193, 120, 0.18)',
  },
  extText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 210, 120, 0.95)',
  },
  excerpt: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.textHigh,
  },
  excerptUser: { color: 'rgba(255, 255, 255, 0.94)' },
  excerptProse: { fontStyle: 'italic' },
  excerptCode: {
    fontFamily: mono,
    fontSize: 12,
    fontStyle: 'normal',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  footer: {
    fontSize: 10,
    color: tokens.textLow,
    fontVariant: ['tabular-nums'],
  },
  footerUser: { color: 'rgba(255, 255, 255, 0.55)' },
});
