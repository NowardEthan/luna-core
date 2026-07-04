import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';
import { VoiceClip } from '../data/fixtures';
import type { ThreadReference } from '../lib/messageReference';
import type { ComposerAttachment, ComposerSendPayload } from '../lib/composerAttachmentModel';
import { ComposerReferenceChip } from './ComposerReferenceChip';
import { ComposerAttachSheet } from './compositor/ComposerAttachSheet';
import { ComposerAttachmentStrip } from './compositor/ComposerAttachmentStrip';
import { Glass } from './Glass';
import { VoiceMicRecorder } from './VoiceMicRecorder';
import { VoiceRecordingOverlay } from './VoiceRecordingOverlay';
import { IDLE_VOICE_UI, type VoiceHoldUi } from './voiceUi';

const MIN_INPUT_HEIGHT = 40;
const MAX_INPUT_HEIGHT = 128;
const OUTER_BTN = 46;
const INPUT_PAD_V = 18;
const LINE_HEIGHT = 23;
const FONT_SIZE = 15.5;

function estimateInputHeight(text: string, width: number): number {
  if (!text.trim() || width <= 0) return MIN_INPUT_HEIGHT;
  const charsPerLine = Math.max(8, Math.floor(width / (FONT_SIZE * 0.52)));
  const lines = text.split('\n').reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, lines * LINE_HEIGHT + INPUT_PAD_V));
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend: (payload: ComposerSendPayload) => void;
  onVoiceResult?: (clip: VoiceClip) => void;
  placeholder?: string;
  editable?: boolean;
  messageReference?: ThreadReference | null;
  onClearReference?: () => void;
}

export interface ComposerHandle {
  focus: () => void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  {
    value,
    onChange,
    onSend,
    onVoiceResult,
    placeholder = 'Mensagem',
    editable = true,
    messageReference = null,
    onClearReference,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [voiceUi, setVoiceUi] = useState<VoiceHoldUi>(IDLE_VOICE_UI);
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [inputWidth, setInputWidth] = useState(0);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const inputOpacity = useRef(new Animated.Value(1)).current;
  const sendScale = useRef(new Animated.Value(1)).current;

  const canSend =
    editable && (value.trim().length > 0 || !!messageReference || attachments.length > 0);
  const canRecord = editable && !!onVoiceResult && !canSend;
  const recording = voiceUi.active;
  const expanded = inputHeight > MIN_INPUT_HEIGHT + 2 || value.includes('\n');
  const hasAttachments = attachments.length > 0;

  const handleUiChange = useCallback((ui: VoiceHoldUi) => {
    setVoiceUi(ui);
  }, []);

  useEffect(() => {
    Animated.timing(inputOpacity, {
      toValue: recording ? 0 : 1,
      duration: recording ? 100 : 180,
      easing: recording ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [inputOpacity, recording]);

  useEffect(() => {
    if (!value.trim()) {
      setInputHeight(MIN_INPUT_HEIGHT);
      return;
    }
    if (Platform.OS !== 'android' || inputWidth <= 0) return;
    setInputHeight(estimateInputHeight(value, inputWidth));
  }, [inputWidth, value]);

  const onContentSizeChange = useCallback((height: number) => {
    if (Platform.OS === 'android') return;
    const next = Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, Math.ceil(height)));
    setInputHeight(next);
  }, []);

  const pillMinHeight = Math.max(OUTER_BTN, inputHeight + 8);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend({
      text: value.trim(),
      attachments: attachments.map((a) => ({ ...a })),
    });
    setAttachments([]);
    setAttachSheetOpen(false);
  }, [attachments, canSend, onSend, value]);

  const addAttachments = useCallback((picked: ComposerAttachment[]) => {
    if (picked.length === 0) return;
    setAttachments((prev) => [...prev, ...picked]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <>
      {messageReference && onClearReference ? (
        <ComposerReferenceChip reference={messageReference} onClear={onClearReference} />
      ) : null}
      {hasAttachments ? (
        <ComposerAttachmentStrip attachments={attachments} onRemove={removeAttachment} />
      ) : null}

      <View style={styles.row}>
        <Glass
          radius={expanded ? 22 : 24}
          intensity={28}
          strong
          style={[
            styles.pill,
            { minHeight: pillMinHeight },
            recording && styles.pillRecording,
            expanded && styles.pillExpanded,
            expanded && styles.pillGrow,
          ]}
        >
          <View
            style={[
              styles.pillInner,
              expanded && styles.pillInnerExpanded,
              { minHeight: inputHeight },
            ]}
          >
            <VoiceRecordingOverlay ui={voiceUi} />

            <Animated.View style={[styles.fieldRow, { opacity: inputOpacity, minHeight: inputHeight }]}>
              <View
                style={styles.inputWrap}
                onLayout={(e) => setInputWidth(e.nativeEvent.layout.width)}
              >
                <TextInput
                  ref={inputRef}
                  value={value}
                  onChangeText={onChange}
                  editable={editable && !recording}
                  placeholder={placeholder}
                  placeholderTextColor={tokens.textLow}
                  style={[
                    type.message,
                    styles.input,
                    {
                      height: inputHeight,
                      textAlignVertical:
                        Platform.OS === 'android' || expanded ? 'top' : 'center',
                      paddingTop: Platform.OS === 'android' || expanded ? 10 : 9,
                    },
                  ]}
                  multiline
                  scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT - 1}
                  blurOnSubmit={false}
                  onContentSizeChange={(e) => onContentSizeChange(e.nativeEvent.contentSize.height)}
                  pointerEvents={recording ? 'none' : 'auto'}
                />
              </View>

              <Pressable
                onPress={() => setAttachSheetOpen(true)}
                disabled={!editable || recording}
                hitSlop={8}
                accessibilityLabel="Anexos"
                style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
              >
                <Ionicons
                  name="attach"
                  size={22}
                  color={attachSheetOpen || hasAttachments ? tokens.accentBright : tokens.textMid}
                  style={styles.attachIcon}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Glass>

        <View style={styles.outerAction}>
          {canSend ? (
            <Pressable
              onPress={handleSend}
              onPressIn={() => {
                Animated.spring(sendScale, {
                  toValue: 0.9,
                  friction: 6,
                  tension: 300,
                  useNativeDriver: true,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(sendScale, {
                  toValue: 1,
                  friction: 5,
                  tension: 200,
                  useNativeDriver: true,
                }).start();
              }}
              hitSlop={6}
              accessibilityLabel="Enviar"
            >
              <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                <LinearGradient
                  colors={[tokens.accentBright, tokens.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.actionButton}
                >
                  <Ionicons name="arrow-up" size={22} color={tokens.onAccent} />
                </LinearGradient>
              </Animated.View>
            </Pressable>
          ) : canRecord ? (
            <VoiceMicRecorder onVoiceResult={onVoiceResult} onUiChange={handleUiChange} />
          ) : (
            <View style={[styles.actionButton, styles.buttonDisabled]}>
              <Ionicons name="mic" size={20} color={tokens.onAccent} />
            </View>
          )}
        </View>
      </View>

      <ComposerAttachSheet
        visible={attachSheetOpen}
        disabled={!editable || recording}
        onClose={() => setAttachSheetOpen(false)}
        onPick={addAttachments}
      />
    </>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  pillGrow: {
    overflow: 'visible',
  },
  pillExpanded: {
    minHeight: 52,
  },
  pillRecording: {
    overflow: 'visible',
  },
  pillInner: {
    minHeight: MIN_INPUT_HEIGHT,
    position: 'relative',
    overflow: 'visible',
  },
  pillInnerExpanded: {
    minHeight: MIN_INPUT_HEIGHT,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    width: '100%',
    color: tokens.textHigh,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 12,
    paddingRight: 4,
    fontSize: 16,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    marginRight: 2,
  },
  attachBtnPressed: {
    opacity: 0.65,
  },
  attachIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  outerAction: {
    width: OUTER_BTN,
    height: OUTER_BTN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
    overflow: 'visible',
  },
  actionButton: {
    width: OUTER_BTN,
    height: OUTER_BTN,
    borderRadius: OUTER_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
    backgroundColor: tokens.accentDeep,
    borderRadius: OUTER_BTN / 2,
  },
});
