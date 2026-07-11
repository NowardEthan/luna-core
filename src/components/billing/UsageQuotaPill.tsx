import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usageCompactBadge } from '../../features/billing/usageDisplay';
import type { LunaUsageSnapshot } from '../../features/billing/useLunaUsage';
import { tokens } from '../../theme/tokens';

const TONE_COLOR: Record<'normal' | 'warn' | 'danger', string> = {
  normal: tokens.textMid,
  warn: tokens.warning,
  danger: tokens.error,
};

interface Props {
  usage: LunaUsageSnapshot;
  remaining: number | null;
  exceeded?: boolean;
  onPress?: () => void;
}

/** Pill mínima — restantes de mensagens (header ou composer). */
export const UsageQuotaPill = memo(function UsageQuotaPill({
  usage,
  remaining,
  exceeded,
  onPress,
}: Props) {
  const badge = usageCompactBadge(usage, remaining, exceeded);
  if (!badge) return null;

  const dotColor = TONE_COLOR[badge.tone];

  const content = (
    <View style={[styles.pill, exceeded && styles.pillExceeded]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, badge.tone === 'danger' && styles.labelDanger]} numberOfLines={1}>
        {badge.label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={badge.accessibilityLabel}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={badge.accessibilityLabel} accessibilityRole="text">
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
    maxWidth: 100,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 22, 32, 0.72)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  pillExceeded: {
    borderColor: 'rgba(229, 115, 115, 0.45)',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  label: {
    color: tokens.textMid,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  labelDanger: {
    color: tokens.error,
  },
});
