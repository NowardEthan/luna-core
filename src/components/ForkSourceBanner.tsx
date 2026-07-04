import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../theme/tokens';

interface Props {
  parentTitle: string;
  onOpenParent: () => void;
}

/** Atalho para voltar à conversa de onde veio a bifurcação. */
export const ForkSourceBanner = memo(function ForkSourceBanner({ parentTitle, onOpenParent }: Props) {
  const label = parentTitle && parentTitle !== 'Luna' ? parentTitle : 'conversa original';

  return (
    <Pressable
      onPress={onOpenParent}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Voltar para ${label}`}
    >
      <Ionicons name="git-branch-outline" size={15} color={tokens.accentBright} />
      <View style={styles.textCol}>
        <Text style={styles.kicker}>Bifurcação de</Text>
        <Text style={styles.title} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={16} color={tokens.textMid} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(99, 140, 255, 0.28)',
    backgroundColor: 'rgba(99, 140, 255, 0.08)',
  },
  pressed: { opacity: 0.88 },
  textCol: { flex: 1, minWidth: 0 },
  kicker: {
    color: tokens.textLow,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
});
