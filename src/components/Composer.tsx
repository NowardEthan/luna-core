import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputScrollEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';
import { VoiceClip } from '../data/fixtures';
import { useComposerSessionControls } from '../hooks/ComposerSessionContext';
import type { ThreadReference } from '../lib/messageReference';
import type { ComposerAttachment, ComposerSendPayload } from '../lib/composerAttachmentModel';
import { hapticListTap } from '../lib/haptics';
import { ComposerReferenceChip } from './ComposerReferenceChip';
import { ComposerAttachSheet } from './compositor/ComposerAttachSheet';
import { ComposerAttachmentStrip } from './compositor/ComposerAttachmentStrip';
import { Glass } from './Glass';
import { VoiceMicRecorder } from './VoiceMicRecorder';
import { VoiceRecordingOverlay } from './VoiceRecordingOverlay';
import { IDLE_VOICE_UI, type VoiceHoldUi } from './voiceUi';
import { RosaryTool } from './RosaryTool';
import { ROSARY_ENABLED } from '../config/features';
import type { RosaryState } from '../hooks/useRosary';

const MIN_INPUT_HEIGHT = 40;
/** ~7 linhas visíveis antes do scroll interno. */
const MAX_INPUT_HEIGHT = 168;
const SCROLL_FADE_HEIGHT = 20;
const OUTER_BTN = 46;
/** Slot do botão de voz — compacto; overflow visible para gestos de gravação. */
const MIC_ACTION_SLOT = 54;
const LINE_HEIGHT = 22;
/** A Luna só analisa até 5 imagens por mensagem (limite do servidor de visão). */
const MAX_IMAGE_ATTACHMENTS = 5;
/** Mesmo teto do servidor de extração de documentos. */
const MAX_FILE_ATTACHMENTS = 5;

type ScrollHints = {
  canScrollUp: boolean;
  canScrollDown: boolean;
  isScrollable: boolean;
};

const EMPTY_SCROLL_HINTS: ScrollHints = {
  canScrollUp: false,
  canScrollDown: false,
  isScrollable: false,
};

/** Indica texto oculto acima/abaixo quando o campo faz scroll interno. */
function ComposerScrollFades({ canScrollUp, canScrollDown }: Pick<ScrollHints, 'canScrollUp' | 'canScrollDown'>) {
  if (!canScrollUp && !canScrollDown) return null;

  const fadeColor = 'rgba(22, 24, 31, 0.96)';

  return (
    <>
      {canScrollUp ? (
        <LinearGradient
          pointerEvents="none"
          colors={[fadeColor, 'transparent']}
          style={styles.fadeTop}
        />
      ) : null}
      {canScrollDown ? (
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', fadeColor]}
          style={styles.fadeBottom}
        />
      ) : null}
    </>
  );
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
  rosaryState?: RosaryState;
  onRosaryToggle?: () => void;
  onRosaryLongPress?: () => void;
}

export interface ComposerHandle {
  focus: () => void;
}

export const Composer = memo(forwardRef<ComposerHandle, Props>(function Composer(
  {
    value,
    onChange,
    onSend,
    onVoiceResult,
    placeholder = 'Mensagem',
    editable = true,
    messageReference = null,
    onClearReference,
    rosaryState,
    onRosaryToggle,
    onRosaryLongPress,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const session = useComposerSessionControls();
  const [voiceUi, setVoiceUi] = useState<VoiceHoldUi>(IDLE_VOICE_UI);
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [contentHeight, setContentHeight] = useState(MIN_INPUT_HEIGHT);
  const [scrollHints, setScrollHints] = useState<ScrollHints>(EMPTY_SCROLL_HINTS);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const inputOpacity = useRef(new Animated.Value(1)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  // Crossfade suave entre microfone (0) e enviar (1) — evita o "pop" seco ao digitar.
  const actionMix = useRef(new Animated.Value(0)).current;

  const canSend =
    editable && (value.trim().length > 0 || !!messageReference || attachments.length > 0);
  const canRecord = editable && !!onVoiceResult && !canSend;

  useEffect(() => {
    Animated.timing(actionMix, {
      toValue: canSend ? 1 : 0,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [canSend, actionMix]);
  const recording = voiceUi.active;
  const expanded = inputHeight > MIN_INPUT_HEIGHT + 2 || value.includes('\n');
  const isScrollClipped = contentHeight > MAX_INPUT_HEIGHT + 1;
  const hasAttachments = attachments.length > 0;
  const usedImages = attachments.filter((a) => a.kind === 'image').length;
  const usedFiles = attachments.filter((a) => a.kind === 'file').length;

  const resetInputLayout = useCallback(() => {
    setInputHeight(MIN_INPUT_HEIGHT);
    setContentHeight(MIN_INPUT_HEIGHT);
    setScrollHints(EMPTY_SCROLL_HINTS);
    setScrollEnabled(false);
  }, []);

  const handleUiChange = useCallback((ui: VoiceHoldUi) => {
    setVoiceUi(ui);
  }, []);

  useEffect(() => {
    session.setAttachOpen(attachSheetOpen);
  }, [attachSheetOpen, session]);

  useEffect(() => {
    session.setVoiceActive(recording);
  }, [recording, session]);

  useEffect(() => {
    return () => {
      session.setFocused(false);
      session.setAttachOpen(false);
      session.setVoiceActive(false);
    };
  }, [session]);

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
      resetInputLayout();
      return;
    }
    if (!value.includes('\n')) return;

    const lineCount = value.split('\n').length;
    const fromLines = Math.min(
      MAX_INPUT_HEIGHT,
      Math.max(MIN_INPUT_HEIGHT, lineCount * LINE_HEIGHT + 18),
    );
    setInputHeight(fromLines);
    setContentHeight(fromLines);
    if (fromLines <= MAX_INPUT_HEIGHT) {
      setScrollEnabled(false);
      setScrollHints(EMPTY_SCROLL_HINTS);
    }
  }, [resetInputLayout, value]);

  const handleFocus = useCallback(() => {
    session.setFocused(true);
  }, [session]);

  const handleBlur = useCallback(() => {
    session.setFocused(false);
  }, [session]);

  const updateScrollHints = useCallback((offsetY: number, layoutH: number, contentH: number) => {
    const overflow = contentH - layoutH;
    if (overflow <= 4) {
      setScrollHints(EMPTY_SCROLL_HINTS);
      return;
    }
    setScrollHints({
      isScrollable: true,
      canScrollUp: offsetY > 4,
      canScrollDown: offsetY < overflow - 4,
    });
  }, []);

  const onContentSizeChange = useCallback((height: number) => {
    const measured = Math.ceil(height);
    setContentHeight(measured);
    const next = Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, measured));
    setInputHeight(next);

    if (measured <= MAX_INPUT_HEIGHT + 1) {
      setScrollEnabled(false);
      setScrollHints(EMPTY_SCROLL_HINTS);
    } else {
      setScrollEnabled(true);
      setScrollHints({
        isScrollable: true,
        canScrollUp: true,
        canScrollDown: false,
      });
    }
  }, []);

  const onInputScroll = useCallback(
    (e: NativeSyntheticEvent<TextInputScrollEventData>) => {
      updateScrollHints(e.nativeEvent.contentOffset.y, inputHeight, contentHeight);
    },
    [contentHeight, inputHeight, updateScrollHints],
  );

  const pillMinHeight = Math.max(OUTER_BTN, inputHeight + 8);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    hapticListTap();
    onSend({
      text: value.trim(),
      attachments: attachments.map((a) => ({ ...a })),
    });
    setAttachments([]);
    setAttachSheetOpen(false);
    resetInputLayout();
  }, [attachments, canSend, onSend, resetInputLayout, value]);

  const addAttachments = useCallback((picked: ComposerAttachment[]) => {
    if (picked.length === 0) return;
    setAttachments((prev) => {
      const merged = [...prev, ...picked];
      const images = merged.filter((a) => a.kind === 'image');
      const files = merged.filter((a) => a.kind === 'file');
      const overImages = images.length > MAX_IMAGE_ATTACHMENTS;
      const overFiles = files.length > MAX_FILE_ATTACHMENTS;
      if (overImages || overFiles) {
        Alert.alert(
          'Limite de anexos',
          `A Luna analisa até ${MAX_IMAGE_ATTACHMENTS} imagens e até ${MAX_FILE_ATTACHMENTS} arquivos por mensagem. O restante não foi anexado.`,
        );
      }
      const cappedImages = images.slice(0, MAX_IMAGE_ATTACHMENTS);
      const cappedFiles = files.slice(0, MAX_FILE_ATTACHMENTS);
      const allowedIds = new Set([...cappedImages, ...cappedFiles].map((a) => a.id));
      return merged.filter((a) => allowedIds.has(a.id));
    });
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
          radius={22}
          intensity={28}
          strong
          style={[
            styles.pill,
            { minHeight: pillMinHeight },
            recording && styles.pillRecording,
            expanded && styles.pillExpanded,
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
              <View style={[styles.inputWrap, styles.inputWrapMultiline]}>
                <TextInput
                  ref={inputRef}
                  value={value}
                  onChangeText={onChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  editable={editable && !recording}
                  placeholder={placeholder}
                  placeholderTextColor={tokens.textLow}
                  importantForAutofill="no"
                  autoCorrect
                  autoCapitalize="sentences"
                  style={[
                    type.message,
                    styles.input,
                    {
                      height: inputHeight,
                      lineHeight: LINE_HEIGHT,
                    },
                  ]}
                  multiline
                  scrollEnabled={scrollEnabled || isScrollClipped}
                  blurOnSubmit={false}
                  onScroll={onInputScroll}
                  onContentSizeChange={(e) => onContentSizeChange(e.nativeEvent.contentSize.height)}
                  pointerEvents={recording ? 'none' : 'auto'}
                />
                {isScrollClipped ? (
                  <ComposerScrollFades
                    canScrollUp={scrollHints.canScrollUp}
                    canScrollDown={scrollHints.canScrollDown}
                  />
                ) : null}
              </View>

              {ROSARY_ENABLED && rosaryState && onRosaryToggle ? (
                <RosaryTool
                  active={rosaryState.active}
                  onPress={onRosaryToggle}
                  onLongPress={onRosaryLongPress}
                />
              ) : null}

              <Pressable
                onPress={() => setAttachSheetOpen(true)}
                disabled={!editable || recording || rosaryState?.active}
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
          <Animated.View
            style={[styles.actionLayer, { opacity: actionMix }]}
            pointerEvents={canSend ? 'auto' : 'none'}
          >
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
          </Animated.View>

          <Animated.View
            style={[
              styles.actionLayer,
              { opacity: actionMix.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
            ]}
            pointerEvents={canSend ? 'none' : 'box-none'}
          >
            {onVoiceResult ? (
              <VoiceMicRecorder
                onVoiceResult={onVoiceResult}
                onUiChange={handleUiChange}
                disabled={!canRecord}
              />
            ) : (
              <View style={[styles.actionButton, styles.buttonDisabled]}>
                <Ionicons name="mic" size={20} color={tokens.onAccent} />
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      <ComposerAttachSheet
        visible={attachSheetOpen}
        disabled={!editable || recording}
        imageBudget={Math.max(0, MAX_IMAGE_ATTACHMENTS - usedImages)}
        fileBudget={Math.max(0, MAX_FILE_ATTACHMENTS - usedFiles)}
        maxImages={MAX_IMAGE_ATTACHMENTS}
        maxFiles={MAX_FILE_ATTACHMENTS}
        onClose={() => setAttachSheetOpen(false)}
        onPick={addAttachments}
      />
    </>
  );
}));

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    overflow: 'visible',
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
    position: 'relative',
  },
  inputWrapMultiline: {
    overflow: 'hidden',
    borderRadius: 18,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCROLL_FADE_HEIGHT,
    zIndex: 1,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCROLL_FADE_HEIGHT,
    zIndex: 1,
  },
  input: {
    width: '100%',
    color: tokens.textHigh,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 4,
    fontSize: 16,
    textAlignVertical: 'top',
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
  rosaryBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  attachBtnPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.9 }],
  },
  attachIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  outerAction: {
    width: MIC_ACTION_SLOT,
    height: MIC_ACTION_SLOT,
    marginBottom: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  actionLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionHidden: {
    opacity: 0,
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
