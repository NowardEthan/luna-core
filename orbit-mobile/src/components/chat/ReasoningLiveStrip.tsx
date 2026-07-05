import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StreamWordReveal } from './StreamWordReveal';
import { tokens } from '../../theme/tokens';
import { type } from '../../theme/typography';

type Props = {
  reasoning?: string;
  streaming?: boolean;
};

export function ReasoningLiveStrip({ reasoning, streaming = false }: Props) {
  if (!reasoning?.trim() && !streaming) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Ionicons name="sparkles-outline" size={13} color={tokens.textLow} />
        <Text style={styles.label}>{streaming ? 'A pensar…' : 'Raciocínio'}</Text>
      </View>
      <StreamWordReveal
        text={reasoning ?? ''}
        streaming={streaming}
        style={[type.message, styles.reasoningText]}
        muted
      />
      <View style={styles.separator} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textLow,
  },
  reasoningText: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderSubtle,
    marginTop: 8,
  },
});
