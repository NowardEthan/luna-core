import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { VoiceClip } from '../data/fixtures';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

/** Alturas decorativas das barras (0–1). */
const BAR_LEVELS = [0.35, 0.65, 0.45, 0.9, 0.55, 0.75, 0.4, 0.85, 0.5, 0.7, 0.6, 0.95, 0.48, 0.8, 0.58, 0.72, 0.42, 0.88, 0.52, 0.68];

interface Props {
  messageId: string;
  audio: VoiceClip;
  variant: 'user' | 'luna';
  /** Sem shell exterior — usado dentro de LunaBubbleShell. */
  embedded?: boolean;
  transcript?: string;
  transcriptLoading?: boolean;
  transcriptError?: string;
  onTranscribe?: (messageId: string) => void;
}

/** Bolha de mensagem de voz com play/pause, waveform e transcrição. */
export function VoiceMessageBubble({
  messageId,
  audio,
  variant,
  embedded = false,
  transcript,
  transcriptLoading = false,
  transcriptError,
  onTranscribe,
}: Props) {
  const player = useAudioPlayer(audio.uri);
  const status = useAudioPlayerStatus(player);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const isUser = variant === 'user';
  const playing = status.playing;
  const durationSec = status.duration > 0 ? status.duration : audio.durationMs / 1000;
  const progress = durationSec > 0 ? Math.min(1, status.currentTime / durationSec) : 0;

  const displayMs = playing || status.currentTime > 0
    ? status.currentTime * 1000
    : audio.durationMs;

  useEffect(() => {
    if (transcript) setTranscriptOpen(true);
  }, [transcript]);

  const toggle = () => {
    if (playing) {
      player.pause();
    } else {
      if (status.currentTime >= durationSec - 0.05) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const barColors = useMemo(
    () => ({
      active: isUser ? 'rgba(255,255,255,0.95)' : tokens.accentBright,
      idle: isUser ? 'rgba(255,255,255,0.38)' : 'rgba(122, 154, 245, 0.35)',
    }),
    [isUser],
  );

  const canTranscribe = !!onTranscribe && !transcript && !transcriptLoading;
  const transcribeLabel = transcriptError ? 'Tentar novamente' : 'Transcrever';
  const showTranscriptBlock = transcriptLoading || (transcript && transcriptOpen);

  const shellContent = (
    <>
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          style={[styles.playBtn, isUser ? styles.playBtnUser : styles.playBtnLuna]}
          accessibilityLabel={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={18}
            color={isUser ? tokens.onAccent : tokens.accentBright}
            style={!playing ? styles.playIconOffset : undefined}
          />
        </Pressable>

        <View style={styles.waveCol}>
          <View style={styles.bars}>
            {BAR_LEVELS.map((level, i) => {
              const threshold = (i + 1) / BAR_LEVELS.length;
              const lit = progress >= threshold - 0.05;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: 6 + level * 18,
                      backgroundColor: lit ? barColors.active : barColors.idle,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={[styles.time, isUser ? styles.timeUser : styles.timeLuna]}>
            {formatVoiceDuration(displayMs)}
          </Text>
        </View>
      </View>

      {(canTranscribe || transcript || transcriptLoading || transcriptError) && (
        <View style={[styles.transcriptDivider, isUser ? styles.dividerUser : styles.dividerLuna]} />
      )}

      {canTranscribe ? (
        <Pressable
          onPress={() => onTranscribe?.(messageId)}
          style={styles.transcribeBtn}
          accessibilityLabel={transcriptError ? 'Tentar transcrever novamente' : 'Transcrever áudio'}
          accessibilityRole="button"
        >
          <Ionicons
            name={transcriptError ? 'refresh' : 'text'}
            size={14}
            color={isUser ? 'rgba(255,255,255,0.82)' : tokens.accentText}
          />
          <Text style={[styles.transcribeLabel, isUser ? styles.transcribeUser : styles.transcribeLuna]}>
            {transcribeLabel}
          </Text>
        </Pressable>
      ) : null}

      {transcriptError && !transcriptLoading ? (
        <Text style={[styles.transcriptError, isUser ? styles.transcriptErrorUser : styles.transcriptErrorLuna]}>
          {transcriptError}
        </Text>
      ) : null}

      {transcriptLoading ? (
        <View style={styles.transcriptLoading}>
          <ActivityIndicator size="small" color={isUser ? 'rgba(255,255,255,0.9)' : tokens.accentBright} />
          <Text style={[styles.transcriptLoadingText, isUser ? styles.timeUser : styles.timeLuna]}>
            A transcrever…
          </Text>
        </View>
      ) : null}

      {showTranscriptBlock && transcript ? (
        <View style={styles.transcriptBlock}>
          <Text style={[type.message, styles.transcriptText, isUser ? styles.transcriptUser : styles.transcriptLuna]}>
            {transcript}
          </Text>
          <Pressable
            onPress={() => setTranscriptOpen(false)}
            hitSlop={8}
            accessibilityLabel="Ocultar transcrição"
          >
            <Text style={[styles.collapseLabel, isUser ? styles.transcribeUser : styles.transcribeLuna]}>
              Ocultar
            </Text>
          </Pressable>
        </View>
      ) : null}

      {transcript && !transcriptOpen && !transcriptLoading ? (
        <Pressable
          onPress={() => setTranscriptOpen(true)}
          style={styles.transcribeBtn}
          accessibilityLabel="Ver transcrição"
        >
          <Ionicons
            name="document-text-outline"
            size={14}
            color={isUser ? 'rgba(255,255,255,0.82)' : tokens.accentText}
          />
          <Text style={[styles.transcribeLabel, isUser ? styles.transcribeUser : styles.transcribeLuna]}>
            Ver transcrição
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  if (isUser) {
    return (
      <LinearGradient
        colors={[tokens.bubbleUserStart, tokens.bubbleUserEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.userShell}
      >
        {shellContent}
      </LinearGradient>
    );
  }

  if (embedded) {
    return <View style={styles.lunaEmbedded}>{shellContent}</View>;
  }

  return <View style={styles.lunaShell}>{shellContent}</View>;
}

const styles = StyleSheet.create({
  userShell: {
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 200,
    maxWidth: 300,
    shadowColor: tokens.accent,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  lunaShell: {
    backgroundColor: tokens.bubbleLuna,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 200,
    maxWidth: 300,
  },
  lunaEmbedded: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnUser: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  playBtnLuna: {
    backgroundColor: tokens.accentSoft,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  waveCol: {
    flex: 1,
    gap: 6,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 24,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timeUser: {
    color: 'rgba(255,255,255,0.85)',
  },
  timeLuna: {
    color: tokens.textMid,
  },
  transcriptDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
    marginBottom: 8,
  },
  dividerUser: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dividerLuna: {
    backgroundColor: tokens.glassBorder,
  },
  transcribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  transcribeLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  transcribeUser: {
    color: 'rgba(255,255,255,0.82)',
  },
  transcribeLuna: {
    color: tokens.accentText,
  },
  transcriptLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  transcriptLoadingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  transcriptBlock: {
    gap: 8,
    paddingTop: 2,
  },
  transcriptText: {
    lineHeight: 21,
  },
  transcriptUser: {
    color: 'rgba(255,255,255,0.94)',
  },
  transcriptLuna: {
    color: tokens.textHigh,
  },
  collapseLabel: {
    fontSize: 11,
    fontWeight: '600',
    alignSelf: 'flex-end',
    opacity: 0.85,
  },
  transcriptError: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  transcriptErrorUser: {
    color: 'rgba(255,200,200,0.95)',
  },
  transcriptErrorLuna: {
    color: '#F87171',
  },
});
