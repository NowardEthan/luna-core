import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '../data/fixtures';
import { messageCopyText } from '../lib/messageActions';
import { QuotePickToolbar } from './QuotePickToolbar';
import {
  QuoteSelectableBubble,
  type QuoteSelectableBubbleHandle,
} from './QuoteSelectableBubble';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  message: ChatMessage | null;
  messageIndex: number;
  onConfirm: (excerpt: string) => void;
  onCancel: () => void;
}

const MIN_SELECTION = 2;

export const QuotePickOverlay = memo(function QuotePickOverlay({
  visible,
  message,
  messageIndex,
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const bubbleRef = useRef<QuoteSelectableBubbleHandle>(null);
  const [selectedText, setSelectedText] = useState('');

  const fullText = message ? messageCopyText(message) : '';

  useEffect(() => {
    if (!visible) {
      setSelectedText('');
      return;
    }
    setSelectedText('');
    const t = setTimeout(() => bubbleRef.current?.focusText(), 400);
    return () => clearTimeout(t);
  }, [visible, message?.id]);

  const handleNativeSelection = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const { start, end } = e.nativeEvent.selection;
      if (start === end || !fullText) {
        setSelectedText('');
        return;
      }
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      setSelectedText(fullText.slice(from, to).trim());
    },
    [fullText],
  );

  const focusNativeInput = useCallback(() => {
    bubbleRef.current?.focusText();
  }, []);

  if (!message) return null;

  const isUser = message.role === 'user';
  const canConfirmSelection = selectedText.trim().length >= MIN_SELECTION;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Referenciar trecho</Text>
          <Pressable onPress={onCancel} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={tokens.textMid} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Pressable onPress={focusNativeInput} style={styles.focusBanner}>
            <Ionicons name="hand-left-outline" size={16} color={tokens.accentBright} />
            <Text style={styles.focusBannerText}>
              Toque na bolha, depois <Text style={styles.focusBold}>segure</Text> no texto até
              aparecerem os marcadores. Arraste para ajustar o trecho.
            </Text>
          </Pressable>
          <QuoteSelectableBubble
            ref={bubbleRef}
            message={message}
            onSelectionChange={handleNativeSelection}
          />
        </ScrollView>

        <QuotePickToolbar
          messageIndex={messageIndex}
          isUser={isUser}
          selectedText={selectedText}
          fullText={fullText}
          canConfirmSelection={canConfirmSelection}
          onFocusNative={focusNativeInput}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 14, 0.97)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '600',
  },
  closeBtn: { padding: 4 },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 16, paddingBottom: 12 },
  focusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(99, 140, 255, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99, 140, 255, 0.25)',
  },
  focusBannerText: { flex: 1, color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  focusBold: { color: tokens.textHigh, fontWeight: '700' },
});
