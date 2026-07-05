import React, { memo, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import type { ChatMessage } from '../data/fixtures';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import { messageCopyText } from '../lib/messageActions';
import { LunaBubbleShell } from './LunaBubbleShell';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

export type QuoteSelectableBubbleHandle = {
  focusText: () => void;
};

interface Props {
  message: ChatMessage;
  onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
}

/** Bolha com TextInput editável-bloqueado — seleção nativa fora da FlatList. */
export const QuoteSelectableBubble = memo(
  forwardRef<QuoteSelectableBubbleHandle, Props>(function QuoteSelectableBubble(
    { message, onSelectionChange },
    ref,
  ) {
    const isUser = message.role === 'user';
    const isVoice = !!message.audio;
    const fullText = messageCopyText(message);
    const inputRef = useRef<TextInput>(null);

    useImperativeHandle(ref, () => ({
      focusText: () => inputRef.current?.focus(),
    }));

    return (
      <View style={styles.wrap} accessibilityLabel="Mensagem para selecionar trecho">
        <View style={styles.highlightRing} />
        <View style={[styles.row, isUser ? styles.rowUser : styles.rowLuna]}>
          <View style={[styles.shell, isUser ? styles.shellUser : styles.shellLuna]}>
            {isUser ? (
              <UserSelectableBubble
                isVoice={isVoice}
                text={fullText}
                durationMs={message.audio?.durationMs}
                inputRef={inputRef}
                onSelectionChange={onSelectionChange}
              />
            ) : (
              <LunaSelectableBubble
                isVoice={isVoice}
                text={fullText}
                durationMs={message.audio?.durationMs}
                inputRef={inputRef}
                onSelectionChange={onSelectionChange}
              />
            )}
          </View>
        </View>
        <View style={styles.badge}>
          <Ionicons name="hand-left-outline" size={11} color={tokens.accentBright} />
          <Text style={styles.badgeText}>Segure no texto · arraste os marcadores</Text>
        </View>
      </View>
    );
  }),
);

const SelectableText = forwardRef<
  TextInput,
  {
    text: string;
    variant: 'user' | 'luna';
    onSelectionChange: Props['onSelectionChange'];
  }
>(function SelectableText({ text, variant, onSelectionChange }, ref) {
  const { height: windowHeight } = useWindowDimensions();
  const isUser = variant === 'user';
  const locked = useRef(text);
  locked.current = text;

  const maxScrollHeight = useMemo(
    () => Math.min(Math.max(windowHeight * 0.42, 200), 480),
    [windowHeight],
  );

  return (
    <TextInput
      ref={ref}
      value={text}
      editable
      multiline
      scrollEnabled
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      caretHidden
      showSoftInputOnFocus={false}
      contextMenuHidden={false}
      importantForAutofill="no"
      onChangeText={(next) => {
        if (next !== locked.current && ref && typeof ref !== 'function' && ref.current) {
          ref.current.setNativeProps({ text: locked.current });
        }
      }}
      onSelectionChange={onSelectionChange}
      style={[
        type.message,
        isUser ? styles.userText : styles.lunaText,
        styles.selectableInput,
        { maxHeight: maxScrollHeight },
      ]}
      accessibilityLabel="Segure para selecionar um trecho"
      {...(Platform.OS === 'android' ? { textAlignVertical: 'top' as const } : {})}
    />
  );
});

function UserSelectableBubble({
  isVoice,
  text,
  durationMs,
  inputRef,
  onSelectionChange,
}: {
  isVoice: boolean;
  text: string;
  durationMs?: number;
  inputRef: React.RefObject<TextInput | null>;
  onSelectionChange: Props['onSelectionChange'];
}) {
  return (
    <LinearGradient
      colors={[tokens.bubbleUserStart, tokens.bubbleUserEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.userBubble}
    >
      {isVoice ? (
        <VoiceSelectableContent
          text={text}
          durationMs={durationMs}
          variant="user"
          inputRef={inputRef}
          onSelectionChange={onSelectionChange}
        />
      ) : (
        <SelectableText ref={inputRef} text={text} variant="user" onSelectionChange={onSelectionChange} />
      )}
    </LinearGradient>
  );
}

function LunaSelectableBubble({
  isVoice,
  text,
  durationMs,
  inputRef,
  onSelectionChange,
}: {
  isVoice: boolean;
  text: string;
  durationMs?: number;
  inputRef: React.RefObject<TextInput | null>;
  onSelectionChange: Props['onSelectionChange'];
}) {
  return (
    <LunaBubbleShell firstInGroup={false}>
      {isVoice ? (
        <VoiceSelectableContent
          text={text}
          durationMs={durationMs}
          variant="luna"
          inputRef={inputRef}
          onSelectionChange={onSelectionChange}
        />
      ) : (
        <SelectableText ref={inputRef} text={text} variant="luna" onSelectionChange={onSelectionChange} />
      )}
    </LunaBubbleShell>
  );
}

function VoiceSelectableContent({
  text,
  durationMs,
  variant,
  inputRef,
  onSelectionChange,
}: {
  text: string;
  durationMs?: number;
  variant: 'user' | 'luna';
  inputRef: React.RefObject<TextInput | null>;
  onSelectionChange: Props['onSelectionChange'];
}) {
  const dur = durationMs != null ? formatVoiceDuration(durationMs) : '0:00';
  const light = variant === 'user';
  const hasTranscript = text.trim().length > 0 && text !== '[Mensagem de voz]';

  return (
    <View style={styles.voiceBlock}>
      <View style={styles.voiceRow}>
        <View style={[styles.voicePlay, light && styles.voicePlayUser]}>
          <Ionicons name="mic" size={14} color={light ? tokens.onAccent : tokens.accentBright} />
        </View>
        <View style={styles.voiceBars}>
          {VOICE_BARS.map((h, i) => (
            <View
              key={i}
              style={[
                styles.voiceBar,
                { height: 4 + h * 10 },
                light ? styles.voiceBarUser : styles.voiceBarLuna,
              ]}
            />
          ))}
        </View>
        <Text style={[styles.voiceDur, light && styles.voiceDurUser]}>{dur}</Text>
      </View>
      {hasTranscript ? (
        <SelectableText
          ref={inputRef}
          text={text}
          variant={variant}
          onSelectionChange={onSelectionChange}
        />
      ) : (
        <Text style={[styles.voiceHint, light && styles.voiceHintUser]}>
          Sem transcrição — use “Mensagem inteira” abaixo.
        </Text>
      )}
    </View>
  );
}

const VOICE_BARS = [0.4, 0.7, 0.5, 0.9, 0.55, 0.75, 0.45, 0.85, 0.6, 0.72];

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: 6,
  },
  highlightRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(99, 140, 255, 0.55)',
    backgroundColor: 'rgba(99, 140, 255, 0.06)',
    zIndex: -1,
  },
  row: { flexDirection: 'row', width: '100%' },
  rowUser: { justifyContent: 'flex-end' },
  rowLuna: { justifyContent: 'flex-start', paddingRight: 28 },
  shell: { position: 'relative', maxWidth: '100%' },
  shellUser: { maxWidth: '100%', alignSelf: 'flex-end' },
  shellLuna: { alignSelf: 'flex-start' },
  badge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(99, 140, 255, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99, 140, 255, 0.35)',
  },
  badgeText: {
    color: tokens.accentBright,
    fontSize: 11,
    fontWeight: '600',
  },
  userBubble: {
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  userText: { color: tokens.onAccent, lineHeight: 21 },
  lunaText: { color: tokens.textHigh, lineHeight: 21 },
  selectableInput: {
    padding: 0,
    margin: 0,
    width: '100%',
    backgroundColor: 'transparent',
  },
  voiceBlock: { gap: 8 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  voicePlay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
  },
  voicePlayUser: { backgroundColor: 'rgba(255,255,255,0.2)' },
  voiceBars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  voiceBar: { width: 2.5, borderRadius: 2 },
  voiceBarUser: { backgroundColor: 'rgba(255,255,255,0.55)' },
  voiceBarLuna: { backgroundColor: 'rgba(136, 193, 242, 0.55)' },
  voiceDur: { color: tokens.textMid, fontSize: 11, fontWeight: '500' },
  voiceDurUser: { color: 'rgba(242, 244, 248, 0.75)' },
  voiceHint: { color: tokens.textMid, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  voiceHintUser: { color: 'rgba(242, 244, 248, 0.85)' },
});
