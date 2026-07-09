import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BubbleEnter } from './BubbleEnter';
import { LunaBubbleShell } from './LunaBubbleShell';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { MessageMarkdown } from './chat/MessageMarkdown';
import { StreamingMarkdown } from './chat/StreamingMarkdown';
import { StreamWordReveal } from './chat/StreamWordReveal';
import { ReasoningLiveStrip } from './chat/ReasoningLiveStrip';
import { LunaActionTimeline } from './chat/LunaActionTimeline';
import { buildResearchRunFromSteps } from '../lib/lunaActionModel';
import { ExcerptHighlightText } from './chat/excerptHighlight';
import { shouldRenderMarkdown } from './chat/detectMarkdown';
import { ThreadReferenceQuote } from './ThreadReferenceQuote';
import { MessageAttachments } from './MessageAttachments';
import { ChatMessage } from '../data/fixtures';
import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { attachmentsEqual } from '../lib/composerAttachmentModel';
import type { ThreadReference } from '../lib/messageReference';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  message: ChatMessage;
  firstInGroup: boolean;
  animateEnter?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  /** Trecho citado a realçar nesta mensagem (navegação por referência). */
  highlightExcerpt?: string;
  onLongPress?: () => void;
  onTranscribe?: (messageId: string) => void;
  onThreadReferencePress?: (reference: ThreadReference) => void;
  onOpenDocumentPreview?: (
    attachment: ComposerAttachment,
    opts?: { highlightExcerpt?: string },
  ) => void;
  onOpenLunaProfile?: () => void;
}

function messageEqual(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.text === b.text &&
    a.format === b.format &&
    a.transcript === b.transcript &&
    a.transcriptLoading === b.transcriptLoading &&
    a.transcriptError === b.transcriptError &&
    a.reference?.messageId === b.reference?.messageId &&
    a.reference?.excerpt === b.reference?.excerpt &&
    a.reference?.kind === b.reference?.kind &&
    attachmentsEqual(a.attachments, b.attachments) &&
    a.audio?.uri === b.audio?.uri &&
    a.audio?.durationMs === b.audio?.durationMs &&
    a.streaming === b.streaming &&
    a.reasoning === b.reasoning &&
    a.reasoningStreaming === b.reasoningStreaming &&
    a.research === b.research &&
    a.researchLive?.ferramenta === b.researchLive?.ferramenta &&
    a.researchLive?.argumento === b.researchLive?.argumento &&
    a.researchLive?.rodada === b.researchLive?.rodada &&
    a.humor?.label === b.humor?.label &&
    a.humor?.tema === b.humor?.tema
  );
}

function MessageBubbleInner({
  message,
  firstInGroup,
  animateEnter = false,
  selected = false,
  dimmed = false,
  highlightExcerpt,
  onLongPress,
  onTranscribe,
  onThreadReferencePress,
  onOpenDocumentPreview,
  onOpenLunaProfile,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const isUser = message.role === 'user';
  const topGap = firstInGroup ? 14 : 4;
  const isVoice = !!message.audio;
  const hasAttachments = Boolean(message.attachments?.length);
  const hasText = Boolean(message.text?.trim());
  const isStreaming = Boolean(message.streaming);
  const isMarkdown = shouldRenderMarkdown(message);
  const richText = !isStreaming && isMarkdown;
  const role = isUser ? 'user' : 'luna';
  const handleReferencePress = message.reference
    ? () => onThreadReferencePress?.(message.reference!)
    : undefined;
  const refVariant = isUser ? 'user-bubble' : 'luna-bubble';
  const pulseExcerpt = !!highlightExcerpt?.trim();

  useEffect(() => {
    const targetScale = selected ? 1.045 : 1;
    const targetLift = selected ? -3 : 0;
    const targetOpacity = dimmed ? 0.32 : 1;
    const targetGlow = selected ? 1 : 0;

    if (!interactions || reduceMotion) {
      scale.setValue(targetScale);
      lift.setValue(targetLift);
      rowOpacity.setValue(targetOpacity);
      glow.setValue(targetGlow);
      return;
    }

    Animated.parallel([
      Animated.spring(scale, { toValue: targetScale, ...springs.press, useNativeDriver: true }),
      Animated.spring(lift, { toValue: targetLift, ...springs.bubble, useNativeDriver: true }),
      Animated.timing(rowOpacity, {
        toValue: targetOpacity,
        duration: selected || dimmed ? 220 : 180,
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: targetGlow,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dimmed, glow, interactions, lift, reduceMotion, rowOpacity, scale, selected]);

  const lunaHumor = !isUser && firstInGroup ? message.humor : undefined;

  const bubble = isUser ? (
    isVoice && message.audio ? (
      <LinearGradient
        colors={[tokens.bubbleUserStart, tokens.bubbleUserEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.userBubble,
          hasAttachments && !hasText && !message.reference && styles.userBubbleMediaSolo,
        ]}
      >
        <View style={styles.userBubbleInner}>
        {message.reference ? (
          <ThreadReferenceQuote
            reference={message.reference}
            variant={refVariant}
            onPress={handleReferencePress}
          />
        ) : null}
        <Pressable onLongPress={onLongPress} delayLongPress={420}>
          <VoiceMessageBubble
            messageId={message.id}
            audio={message.audio}
            variant="user"
            embedded
            transcript={message.transcript}
            transcriptLoading={message.transcriptLoading}
            transcriptError={message.transcriptError}
            onTranscribe={onTranscribe}
          />
        </Pressable>
        </View>
      </LinearGradient>
    ) : (
      <LinearGradient
        colors={[tokens.bubbleUserStart, tokens.bubbleUserEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.userBubble,
          hasAttachments && !hasText && !message.reference && styles.userBubbleMediaSolo,
        ]}
      >
        <View style={styles.userBubbleInner}>
        {message.reference ? (
          <ThreadReferenceQuote
            reference={message.reference}
            variant={refVariant}
            onPress={handleReferencePress}
          />
        ) : null}
        {hasAttachments ? (
          <MessageAttachments
            attachments={message.attachments!}
            solo={!hasText}
            onOpenDocumentPreview={onOpenDocumentPreview}
          />
        ) : null}
        {message.text ? (
          <Pressable onLongPress={onLongPress} delayLongPress={420} style={styles.userTextPress}>
            <ExcerptHighlightText
              text={message.text}
              excerpt={highlightExcerpt}
              style={[
                type.message,
                styles.userText,
                message.reference ? styles.userReplyText : undefined,
                hasAttachments ? styles.userTextWithAttachments : undefined,
              ]}
              highlightStyle={styles.userExcerptHighlight}
              pulse={pulseExcerpt}
            />
          </Pressable>
        ) : null}
        </View>
      </LinearGradient>
    )
  ) : isVoice && message.audio ? (
    <LunaBubbleShell firstInGroup={firstInGroup} compact humor={lunaHumor} onPressProfile={onOpenLunaProfile}>
      <VoiceMessageBubble
        messageId={message.id}
        audio={message.audio}
        variant="luna"
        embedded
        transcript={message.transcript}
        transcriptLoading={message.transcriptLoading}
        transcriptError={message.transcriptError}
        onTranscribe={onTranscribe}
      />
    </LunaBubbleShell>
  ) : (
    <LunaBubbleShell
      firstInGroup={firstInGroup}
      richText={richText}
      humor={lunaHumor}
      onPressProfile={onOpenLunaProfile}
    >
      {message.reference ? (
        <ThreadReferenceQuote
          reference={message.reference}
          variant="luna-bubble"
          onPress={handleReferencePress}
        />
      ) : null}
      {hasAttachments ? (
        <MessageAttachments
          attachments={message.attachments!}
          solo={!hasText && !message.reference}
          onOpenDocumentPreview={onOpenDocumentPreview}
        />
      ) : null}
      {(message.research?.length || message.researchLive) && (
        <LunaActionTimeline
          run={buildResearchRunFromSteps(message.research ?? [], {
            live: message.researchLive
              ? {
                  ferramenta: message.researchLive.ferramenta,
                  argumento: message.researchLive.argumento,
                  rodada: message.researchLive.rodada,
                  maxRodadas: message.researchLive.maxRodadas,
                }
              : undefined,
            reasoning: message.reasoning,
            citedText: message.text,
          })}
        />
      )}
      {message.reasoning?.trim() || message.reasoningStreaming ? (
        <ReasoningLiveStrip
          reasoning={message.reasoning}
          streaming={message.reasoningStreaming}
        />
      ) : null}
      {isStreaming ? (
        isMarkdown ? (
          <StreamingMarkdown text={message.text ?? ''} highlightExcerpt={highlightExcerpt} />
        ) : (
          <StreamWordReveal
            text={message.text ?? ''}
            streaming
            style={[type.message, styles.lunaText]}
          />
        )
      ) : richText ? (
        <MessageMarkdown content={message.text || ' '} highlightExcerpt={highlightExcerpt} />
      ) : (
        <ExcerptHighlightText
          text={message.text || ' '}
          excerpt={highlightExcerpt}
          style={[type.message, styles.lunaText]}
          pulse={pulseExcerpt}
        />
      )}
    </LunaBubbleShell>
  );

  const content = (
    <Pressable onLongPress={onLongPress} delayLongPress={420} style={styles.pressTarget}>
      <Animated.View
        style={[
          styles.row,
          isUser ? styles.rowUser : styles.rowLuna,
          { marginTop: topGap, transform: [{ scale }, { translateY: lift }] },
        ]}
      >
        <View style={[styles.bubbleShell, isUser ? styles.shellUser : styles.shellLuna]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selectionGlow,
              isUser ? styles.selectionGlowUser : styles.selectionGlowLuna,
              { opacity: glow },
            ]}
          />
          {bubble}
        </View>
      </Animated.View>
    </Pressable>
  );

  const wrapped = (
    <Animated.View style={[styles.wrap, { opacity: rowOpacity }, selected && styles.wrapSelected]}>
      {content}
    </Animated.View>
  );

  return animateEnter ? (
    <BubbleEnter role={role} animate>
      {wrapped}
    </BubbleEnter>
  ) : (
    wrapped
  );
}

export const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  return (
    prev.firstInGroup === next.firstInGroup &&
    prev.animateEnter === next.animateEnter &&
    prev.selected === next.selected &&
    prev.dimmed === next.dimmed &&
    prev.highlightExcerpt === next.highlightExcerpt &&
    prev.onLongPress === next.onLongPress &&
    prev.onTranscribe === next.onTranscribe &&
    prev.onThreadReferencePress === next.onThreadReferencePress &&
    prev.onOpenDocumentPreview === next.onOpenDocumentPreview &&
    prev.onOpenLunaProfile === next.onOpenLunaProfile &&
    messageEqual(prev.message, next.message)
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  wrapSelected: {
    zIndex: 20,
    ...(Platform.OS === 'android'
      ? { elevation: 12 }
      : {
          shadowColor: tokens.accent,
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  pressTarget: { width: '100%' },
  row: { flexDirection: 'row', width: '100%' },
  rowUser: { justifyContent: 'flex-end' },
  rowLuna: { justifyContent: 'flex-start', paddingRight: 28 },
  bubbleShell: { position: 'relative', maxWidth: '88%', minWidth: 0 },
  shellUser: { maxWidth: '78%', alignSelf: 'flex-end', minWidth: 0 },
  shellLuna: { alignSelf: 'flex-start' },
  selectionGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1.5,
    zIndex: 1,
  },
  selectionGlowUser: {
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectionGlowLuna: {
    borderColor: 'rgba(136, 193, 242, 0.45)',
    backgroundColor: 'rgba(75, 117, 242, 0.12)',
  },
  lunaText: { color: tokens.textHigh },
  userBubble: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
    shadowColor: tokens.accent,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  userBubbleMediaSolo: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  userBubbleInner: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  userTextPress: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  userText: { color: tokens.onAccent },
  userExcerptHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
    color: tokens.onAccent,
  },
  userReplyText: {
    paddingTop: 2,
  },
  userTextWithAttachments: {
    paddingTop: 6,
  },
});
