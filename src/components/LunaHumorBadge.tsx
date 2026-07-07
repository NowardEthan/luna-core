import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HUMOR_TEMA_COR, type LunaHumorBadge as LunaHumorBadgeType } from '../lib/lunaHumor';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  humor: LunaHumorBadgeType;
  /** compacto = só emoji + label curto (header) */
  compact?: boolean;
}

/** Badge de humor dual-layer — clima + relação por uid. */
export const LunaHumorBadge = memo(function LunaHumorBadge({ humor, compact = false }: Props) {
  const accent = HUMOR_TEMA_COR[humor.tema] ?? tokens.textMid;

  return (
    <View
      style={[styles.pill, compact && styles.pillCompact, { borderColor: `${accent}55` }]}
      accessibilityRole="text"
      accessibilityLabel={humor.accessibilityLabel}
    >
      <Text style={styles.emoji} accessibilityElementsHidden>
        {humor.emoji}
      </Text>
      <Text style={[styles.label, compact && styles.labelCompact, { color: accent }]} numberOfLines={1}>
        {humor.label}
      </Text>
      {!compact && humor.narrativa ? (
        <Text style={styles.narrativa} numberOfLines={2}>
          {humor.narrativa}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 22, 32, 0.72)',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  pillCompact: {
    flexShrink: 1,
    maxWidth: 88,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexWrap: 'nowrap',
  },
  emoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  labelCompact: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
  },
  narrativa: {
    width: '100%',
    fontSize: 11,
    lineHeight: 15,
    color: tokens.textLow,
    marginTop: 2,
  },
});
