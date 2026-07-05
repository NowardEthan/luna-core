import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FREE_QUOTA_WINDOW_HOURS,
  QUOTA_KIND_LABELS,
  type QuotaKind,
} from '../../features/billing/planQuotas';
import type { LunaUsageSnapshot } from '../../features/billing/useLunaUsage';
import { formatResetInHours } from '../../features/billing/planQuotas';
import { tokens } from '../../theme/tokens';

interface Props {
  usage: LunaUsageSnapshot;
}

function barColor(pct: number): string {
  if (pct >= 90) return '#E57373';
  if (pct >= 70) return '#FFB74D';
  return tokens.accentBright;
}

function resetLabel(usage: LunaUsageSnapshot): string {
  if (usage.cycle === 'window' && usage.resetHours != null) {
    return `Renova ${formatResetInHours(usage.resetHours)}`;
  }
  if (usage.resetDays != null) {
    return `Renova em ${usage.resetDays} dias`;
  }
  return '';
}

function QuotaRow({
  label,
  used,
  limit,
  loading,
}: {
  label: string;
  used: number;
  limit: number;
  loading?: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, Math.floor((used / limit) * 100)) : 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowCount}>
          {loading ? '…' : `${used} de ${limit.toLocaleString('pt-BR')}`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${loading ? 0 : pct}%`, backgroundColor: barColor(pct) }]} />
      </View>
    </View>
  );
}

/** Uso na nuvem — janela rolante (Grátis) ou mensal (pagos). */
export function UsageMeter({ usage }: Props) {
  if (usage.cycle === 'unlimited') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Mensagens na nuvem</Text>
        <Text style={styles.unlimited}>Uso ilimitado neste plano</Text>
      </View>
    );
  }

  if (usage.cycle === 'window') {
    const kinds = (Object.keys(usage.limits) as QuotaKind[]).filter(
      (k) => usage.limits[k] !== null,
    );
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Limites do plano Grátis</Text>
          <Text style={styles.meta}>
            {usage.loading ? '…' : `Janela de ${FREE_QUOTA_WINDOW_HOURS} h · ${resetLabel(usage)}`}
          </Text>
        </View>
        {kinds.map((kind) => (
          <QuotaRow
            key={kind}
            label={QUOTA_KIND_LABELS[kind]}
            used={usage.used[kind]}
            limit={usage.limits[kind] ?? 0}
            loading={usage.loading}
          />
        ))}
      </View>
    );
  }

  const limit = usage.effectiveLimit;
  if (limit === null) return null;
  const fill = usage.loading ? 0 : Math.min(100, usage.pct);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Mensagens este mês</Text>
        <Text style={styles.count}>
          {usage.loading ? '…' : `${usage.usedMessages} de ${limit.toLocaleString('pt-BR')}`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fill}%`, backgroundColor: barColor(usage.pct) }]} />
      </View>
      <Text style={styles.meta}>
        {usage.loading
          ? 'Carregando uso…'
          : usage.pct >= 90
            ? `Quase no limite — ${resetLabel(usage)}`
            : resetLabel(usage)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { gap: 4 },
  title: { color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  count: { color: tokens.textMid, fontSize: 13 },
  row: { gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: tokens.textMid, fontSize: 13, fontWeight: '500' },
  rowCount: { color: tokens.textLow, fontSize: 12 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.glassStrong,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  meta: { color: tokens.textLow, fontSize: 12 },
  unlimited: { color: tokens.textMid, fontSize: 13 },
});
