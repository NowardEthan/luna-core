import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatResetPrecise } from '../../features/billing/planQuotas';
import type { LunaUsageSnapshot } from '../../features/billing/useLunaUsage';
import { tokens } from '../../theme/tokens';

interface Props {
  usage: LunaUsageSnapshot;
  remaining: number | null;
  exceeded?: boolean;
  onPress?: () => void;
  /** Sem margem de fluxo — para posição absoluta acima do composer. */
  floating?: boolean;
}

function chipTone(exceeded: boolean, remaining: number | null, limit: number | null): string {
  if (exceeded) return '#E57373';
  if (limit != null && remaining != null && remaining <= Math.max(3, Math.ceil(limit * 0.1))) {
    return '#FFB74D';
  }
  return tokens.textMid;
}

/** Pill compacta acima do composer — restantes ou limite esgotado. */
export const UsageLimitChip = memo(function UsageLimitChip({
  usage,
  remaining,
  exceeded,
  onPress,
  floating = false,
}: Props) {
  const limit = usage.effectiveLimit;
  if (limit === null || usage.cycle === 'unlimited') return null;

  const tone = chipTone(Boolean(exceeded), remaining, limit);
  const resetHint =
    usage.cycle === 'window' && usage.resetsAtMs != null
      ? formatResetPrecise(usage.resetsAtMs - Date.now())
      : usage.resetDays != null
        ? `em ${usage.resetDays} d`
        : null;

  const label = usage.loading
    ? 'Carregando uso…'
    : exceeded
      ? 'Limite de mensagens atingido'
      : `${remaining ?? 0} msgs${resetHint ? ` · renova ${resetHint}` : ''}`;

  const detail =
    !usage.loading && exceeded
      ? `${usage.usedMessages} de ${limit} · Toque para ver planos`
      : !usage.loading && !exceeded && usage.cycle === 'window'
        ? 'Imagens, arquivos e voz têm limites separados'
        : !usage.loading && !exceeded && remaining != null && remaining <= 5
          ? 'Quase no limite'
          : null;

  const content = (
    <View style={[styles.chip, floating && styles.chipFloating, exceeded && styles.chipExceeded]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[styles.label, exceeded && styles.labelExceeded]}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );

  if (exceeded && onPress) {
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 22, 32, 0.88)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  chipFloating: {
    marginBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipExceeded: {
    borderColor: 'rgba(229, 115, 115, 0.45)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    color: tokens.textMid,
    fontSize: 12,
    fontWeight: '600',
  },
  labelExceeded: {
    color: '#E57373',
  },
  detail: {
    color: tokens.textLow,
    fontSize: 11,
    flexBasis: '100%',
    marginLeft: 12,
  },
});
