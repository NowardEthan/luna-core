import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatResetPrecise } from '../../features/billing/planQuotas';
import type { LunaUsageSnapshot } from '../../features/billing/useLunaUsage';
import { tokens } from '../../theme/tokens';

interface Props {
  usage: LunaUsageSnapshot;
  remaining: number | null;
  exceeded?: boolean;
  reduced?: boolean;
  onPress?: () => void;
}

/** Aviso compacto — quota esgotada ou modo reduzido ativo. */
export const UsageLimitChip = memo(function UsageLimitChip({
  usage,
  remaining,
  exceeded,
  reduced,
  onPress,
}: Props) {
  if (!exceeded && !reduced) return null;

  const limit = usage.effectiveLimit;
  if (limit === null || usage.cycle === 'unlimited') return null;

  const resetHint =
    reduced && usage.reducedMode?.resetsAtMs != null
      ? formatResetPrecise(usage.reducedMode.resetsAtMs - Date.now())
      : usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null
        ? formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now())
        : usage.cycle === 'window' && usage.resetsAtMs != null
          ? formatResetPrecise(usage.resetsAtMs - Date.now())
          : usage.resetDays != null
            ? `em ${usage.resetDays} dias`
            : null;

  const label = reduced ? 'Modo reduzido' : 'Limite de tokens atingido';
  const detail = reduced
    ? `Modelo econômico (OSS) · máx. ${usage.reducedMode?.requestsPerMinute ?? 5} req/min${resetHint ? ` · renova ${resetHint}` : ''}`
    : resetHint
      ? `Renova ${resetHint} · toque para ver detalhes`
      : 'Toque para ver em Ajustes → Limites';

  const content = (
    <View style={[styles.chip, reduced ? styles.chipReduced : null]}>
      <View style={[styles.dot, reduced ? styles.dotReduced : null]} />
      <View style={styles.textCol}>
        <Text style={[styles.label, reduced ? styles.labelReduced : null]}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(229, 115, 115, 0.08)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(229, 115, 115, 0.35)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E57373',
    marginTop: 5,
  },
  textCol: { flex: 1, gap: 2 },
  label: {
    color: '#E57373',
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 16,
  },
  chipReduced: {
    backgroundColor: 'rgba(255, 183, 77, 0.08)',
    borderColor: 'rgba(255, 183, 77, 0.35)',
  },
  dotReduced: {
    backgroundColor: '#FFB74D',
  },
  labelReduced: {
    color: '#FFB74D',
  },
});
