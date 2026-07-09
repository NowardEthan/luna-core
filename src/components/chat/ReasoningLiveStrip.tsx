import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StreamWordReveal } from './StreamWordReveal';
import { tokens } from '../../theme/tokens';
import { type } from '../../theme/typography';

type Props = {
  reasoning?: string;
  streaming?: boolean;
};

export function ReasoningLiveStrip({ reasoning, streaming = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!reasoning?.trim() && !streaming) return null;

  const showContent = expanded || streaming;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.labelRow} onPress={() => setExpanded((v) => !v)}>
        <Ionicons name="sparkles-outline" size={13} color={tokens.textLow} />
        <Text style={styles.label}>{streaming ? 'A pensar…' : 'Raciocínio'}</Text>
        <Ionicons
          name={showContent ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={12}
          color={tokens.textLow}
          style={styles.chevron}
        />
      </Pressable>
      {showContent && (
        <StreamWordReveal
          text={reasoning ?? ''}
          streaming={streaming}
          style={[type.message, styles.reasoningText]}
          muted
        />
      )}
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
    flex: 1,
  },
  chevron: {
    marginLeft: 'auto',
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
