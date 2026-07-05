import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ActiveTimeline } from '../lib/branchState';
import { timelineLabel } from '../lib/branchState';
import { tokens } from '../theme/tokens';

interface Props {
  activeTimeline: ActiveTimeline;
  inactiveCount: number;
  forkCount: number;
  onPress: () => void;
}

/** Atalho no topo da thread — abre o navegador de ramificações. */
export const ThreadBranchPill = memo(function ThreadBranchPill({
  activeTimeline,
  inactiveCount,
  forkCount,
  onPress,
}: Props) {
  const parts: string[] = [timelineLabel(activeTimeline)];
  if (inactiveCount > 0) {
    parts.push(`+1 ramo (${inactiveCount} msg)`);
  }
  if (forkCount > 0) {
    parts.push(`${forkCount} bifurcação${forkCount === 1 ? '' : 'ões'}`);
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Abrir ramificações"
    >
      <Ionicons name="git-branch-outline" size={14} color={tokens.accentBright} />
      <Text style={styles.text} numberOfLines={1}>
        {parts.join(' · ')}
      </Text>
      <Ionicons name="chevron-down" size={14} color={tokens.textMid} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(99, 140, 255, 0.35)',
    backgroundColor: 'rgba(99, 140, 255, 0.1)',
    maxWidth: '96%',
  },
  pressed: { opacity: 0.88 },
  text: {
    flexShrink: 1,
    color: tokens.textHigh,
    fontSize: 12,
    fontWeight: '600',
  },
});
