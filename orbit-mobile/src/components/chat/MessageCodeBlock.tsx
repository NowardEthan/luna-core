import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';

import { tokens } from '../../theme/tokens';
import { ExcerptHighlightText, findExcerptRange } from './excerptHighlight';
import { COLLAPSE_LINE_THRESHOLD, PREVIEW_LINES } from './messageCodeTheme';

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

interface Props {
  code: string;
  language: string | null;
  highlightExcerpt?: string;
}

export function MessageCodeBlockInner({ code, language, highlightExcerpt }: Props) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const collapsible = lines.length >= COLLAPSE_LINE_THRESHOLD;
  const hiddenLines = Math.max(0, lines.length - PREVIEW_LINES);
  const excerptMatch = useMemo(
    () => !!highlightExcerpt?.trim() && !!findExcerptRange(code, highlightExcerpt),
    [code, highlightExcerpt],
  );
  const [collapsed, setCollapsed] = useState(collapsible && !excerptMatch);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (excerptMatch) setCollapsed(false);
  }, [excerptMatch]);

  const displayCode = collapsed && collapsible ? lines.slice(0, PREVIEW_LINES).join('\n') : code;
  const langLabel = language ?? 'text';

  const copy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={styles.lang}>{langLabel}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void copy()} style={styles.action} hitSlop={6}>
            <Text style={[styles.actionText, copied && styles.actionTextDone]}>
              {copied ? 'Copiado' : 'Copiar'}
            </Text>
          </Pressable>
          {collapsible ? (
            <Pressable
              onPress={() => setCollapsed((v) => !v)}
              style={styles.action}
              hitSlop={6}
            >
              <Text style={styles.actionText}>{collapsed ? 'Expandir' : 'Colapsar'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.codeWrap}>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
          <ExcerptHighlightText
            text={displayCode}
            excerpt={highlightExcerpt}
            style={styles.code}
            highlightStyle={styles.codeHighlight}
            pulse
          />
        </ScrollView>

        {collapsed && collapsible ? (
          <Pressable onPress={() => setCollapsed(false)} style={styles.fadePress}>
            <LinearGradient
              colors={['transparent', 'rgba(18, 21, 28, 0.72)', tokens.codeBlockBg]}
              style={styles.fadeGradient}
            >
              <Text style={styles.fadeHint}>+{hiddenLines} linhas</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: tokens.codeBlockBg,
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: tokens.codeBlockToolbar,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  lang: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.codeBlockLangFg,
    backgroundColor: tokens.codeBlockLangBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionText: { fontSize: 11, fontWeight: '500', color: tokens.textMid },
  actionTextDone: { color: tokens.online },
  codeWrap: {
    position: 'relative',
    backgroundColor: tokens.codeBlockBg,
  },
  code: {
    fontFamily: mono,
    fontSize: 12.5,
    lineHeight: 20,
    color: tokens.codeBlockText,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  codeHighlight: {
    backgroundColor: 'rgba(99, 140, 255, 0.38)',
    color: '#E8EEFF',
  },
  fadePress: {
    ...StyleSheet.absoluteFillObject,
    top: undefined,
    height: 52,
    justifyContent: 'flex-end',
  },
  fadeGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  fadeHint: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.codeBlockLangFg,
    backgroundColor: tokens.codeBlockLangBg,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});

export const MessageCodeBlock = React.memo(MessageCodeBlockInner, (prev, next) => {
  return prev.code === next.code && prev.language === next.language && prev.highlightExcerpt === next.highlightExcerpt;
});
