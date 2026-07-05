import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import { excerpt, messageCopyText } from '../lib/messageActions';
import { LunaAvatar } from './LunaAvatar';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

import type { ChatMessage } from '../data/fixtures';

interface Props {
  message: ChatMessage;
}

/** Miniatura da bolha selecionada — contexto visual no sheet de ações. */
export const MessageActionPreview = memo(function MessageActionPreview({ message }: Props) {
  const isUser = message.role === 'user';
  const isVoice = !!message.audio;
  const body = excerpt(messageCopyText(message) || 'Mensagem de voz', isVoice ? 64 : 140);

  return (
    <View style={styles.stage} accessibilityLabel="Pré-visualização da mensagem">
      <View style={styles.stageInner}>
        <View style={[styles.row, isUser ? styles.rowUser : styles.rowLuna]}>
          {isUser ? (
            <UserPreview isVoice={isVoice} text={body} durationMs={message.audio?.durationMs} />
          ) : (
            <LunaPreview isVoice={isVoice} text={body} durationMs={message.audio?.durationMs} />
          )}
        </View>
      </View>
      <LinearGradient
        colors={['transparent', tokens.ink1]}
        pointerEvents="none"
        style={styles.stageFade}
      />
      <View style={styles.badge}>
        <Ionicons
          name={isUser ? 'person' : 'sparkles'}
          size={11}
          color={isUser ? tokens.onAccent : tokens.accentBright}
        />
        <Text style={styles.badgeText}>{isUser ? 'Sua mensagem' : 'Resposta da Luna'}</Text>
      </View>
    </View>
  );
});

function UserPreview({
  isVoice,
  text,
  durationMs,
}: {
  isVoice: boolean;
  text: string;
  durationMs?: number;
}) {
  return (
    <LinearGradient
      colors={[tokens.bubbleUserStart, tokens.bubbleUserEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.userBubble}
    >
      {isVoice ? (
        <VoicePreviewRow
          text={text}
          durationMs={durationMs}
          variant="user"
        />
      ) : (
        <Text style={[type.message, styles.userText]} numberOfLines={4}>
          {text}
        </Text>
      )}
    </LinearGradient>
  );
}

function LunaPreview({
  isVoice,
  text,
  durationMs,
}: {
  isVoice: boolean;
  text: string;
  durationMs?: number;
}) {
  return (
    <View style={styles.lunaShell}>
      <View style={styles.lunaHeader}>
        <LunaAvatar size={22} />
        <Text style={styles.lunaName}>Luna</Text>
      </View>
      <View style={styles.lunaRule} />
      <View style={styles.lunaBody}>
        {isVoice ? (
          <VoicePreviewRow text={text} durationMs={durationMs} variant="luna" />
        ) : (
          <Text style={[type.message, styles.lunaText]} numberOfLines={4}>
            {text}
          </Text>
        )}
      </View>
    </View>
  );
}

function VoicePreviewRow({
  text,
  durationMs,
  variant,
}: {
  text: string;
  durationMs?: number;
  variant: 'user' | 'luna';
}) {
  const dur = durationMs != null ? formatVoiceDuration(durationMs) : '0:00';
  const light = variant === 'user';

  return (
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
      {text && text !== 'Mensagem de voz' ? (
        <Text
          style={[styles.voiceTranscript, light && styles.voiceTranscriptUser]}
          numberOfLines={2}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

const VOICE_BARS = [0.4, 0.7, 0.5, 0.9, 0.55, 0.75, 0.45, 0.85, 0.6, 0.72];

const styles = StyleSheet.create({
  stage: {
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: tokens.ink1,
    overflow: 'hidden',
    minHeight: 72,
  },
  stageInner: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    paddingBottom: 28,
  },
  stageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    color: tokens.textMid,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  row: { width: '100%' },
  rowUser: { alignItems: 'flex-end' },
  rowLuna: { alignItems: 'flex-start' },
  userBubble: {
    maxWidth: '92%',
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: tokens.accent,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userText: { color: tokens.onAccent, lineHeight: 21 },
  lunaShell: {
    maxWidth: '96%',
    backgroundColor: tokens.bubbleLuna,
    borderRadius: 16,
    borderTopLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    overflow: 'hidden',
  },
  lunaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  lunaName: {
    color: tokens.accentBright,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  lunaRule: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: tokens.glassBorder,
  },
  lunaBody: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  lunaText: { color: tokens.textHigh, lineHeight: 21 },
  voiceRow: { gap: 6 },
  voicePlay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
    alignSelf: 'flex-start',
  },
  voicePlayUser: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  voiceBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 16,
    marginTop: 2,
  },
  voiceBar: {
    width: 2.5,
    borderRadius: 2,
  },
  voiceBarUser: { backgroundColor: 'rgba(255,255,255,0.55)' },
  voiceBarLuna: { backgroundColor: 'rgba(136, 193, 242, 0.55)' },
  voiceDur: {
    color: tokens.textMid,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  voiceDurUser: { color: 'rgba(242, 244, 248, 0.75)' },
  voiceTranscript: {
    color: tokens.textMid,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    fontStyle: 'italic',
  },
  voiceTranscriptUser: { color: 'rgba(242, 244, 248, 0.85)' },
});
