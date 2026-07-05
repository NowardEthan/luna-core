import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ArchivedBranch } from '../lib/branchState';
import { MessageBubble } from './MessageBubble';
import { tokens } from '../theme/tokens';

interface Props {
  branch: ArchivedBranch;
  headingLabel?: string;
  onToggle: () => void;
}

/** Ramo arquivado colapsável — alinhado com Orbit DS/Chat/Ramo arquivado. */
export const MessageArchivedBranch = memo(function MessageArchivedBranch({
  branch,
  headingLabel,
  onToggle,
}: Props) {
  const label = headingLabel ?? branch.label;
  return (
    <View style={styles.root} accessibilityLabel={label}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: branch.expanded }}
      >
        <Ionicons
          name={branch.expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={tokens.textMid}
        />
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>ramificação arquivada</Text>
      </Pressable>

      {branch.expanded ? (
        <View style={styles.body}>
          {branch.messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              firstInGroup={i === 0 || branch.messages[i - 1]?.role !== msg.role}
              animateEnter={false}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    marginVertical: 10,
    marginHorizontal: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  pressed: { opacity: 0.85 },
  label: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    color: tokens.textLow,
    fontSize: 11,
  },
  body: {
    paddingBottom: 6,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
