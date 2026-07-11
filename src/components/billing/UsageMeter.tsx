import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FREE_QUOTA_WINDOW_HOURS,
  formatResetPrecise,
  formatarTokens,
  weeklyTokenLimitForPlan,
} from '../../features/billing/planQuotas';
import type { LunaUsageSnapshot } from '../../features/billing/useLunaUsage';
import { tokens } from '../../theme/tokens';

interface Props {
  usage: LunaUsageSnapshot;
}

function barColor(pct: number): string {
  if (pct >= 90) return tokens.error;
  if (pct >= 70) return tokens.warning;
  return tokens.accentBright;
}

function resetLabel(usage: LunaUsageSnapshot): string {
  if (usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null) {
    return `Semana renova ${formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now())}`;
  }
  if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    return `Renova ${formatResetPrecise(usage.resetsAtMs - Date.now())}`;
  }
  if (usage.resetDays != null) {
    return `Renova em ${usage.resetDays} dias`;
  }
  return '';
}

function bindingHint(usage: LunaUsageSnapshot): string | null {
  if (usage.cycle !== 'window' || usage.loading) return null;
  if (usage.bindingCycle === 'weekly') return 'Limita agora: semana';
  return `Limita agora: janela de ${FREE_QUOTA_WINDOW_HOURS} h`;
}

function QuotaRow({
  label,
  used,
  limit,
  loading,
  active,
}: {
  label: string;
  used: number;
  limit: number;
  loading?: boolean;
  active?: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, Math.floor((used / limit) * 100)) : 0;
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <View style={styles.rowHeader}>
        <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{label}</Text>
        <Text style={styles.rowCount}>
          {loading ? '…' : `${formatarTokens(used)} de ${formatarTokens(limit)}`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${loading ? 0 : pct}%`, backgroundColor: barColor(pct) }]} />
      </View>
    </View>
  );
}

/** Uso na nuvem — janela rolante (Grátis) ou ilimitado (BYOK). */
export function UsageMeter({ usage }: Props) {
  if (usage.cycle === 'unlimited') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Tokens na nuvem</Text>
        <Text style={styles.unlimited}>Uso ilimitado neste plano</Text>
      </View>
    );
  }

  if (usage.cycle === 'window') {
    const weeklyLimit = weeklyTokenLimitForPlan(usage.planId);
    const windowLimit = usage.windowTokenLimit ?? 0;
    const hint = bindingHint(usage);

    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Limites do plano</Text>
          <Text style={styles.meta}>
            Chat, imagens, voz e arquivos consomem do mesmo saldo de tokens.
          </Text>
          {hint ? <Text style={styles.bindingHint}>{hint}</Text> : null}
          <Text style={styles.metaSub}>
            {usage.loading ? '…' : `Janela de ${FREE_QUOTA_WINDOW_HOURS} h · ${resetLabel(usage)}`}
          </Text>
        </View>
        {weeklyLimit != null ? (
          <QuotaRow
            label="Tokens na semana"
            used={usage.weeklyTokens?.used ?? 0}
            limit={weeklyLimit}
            loading={usage.loading}
            active={usage.bindingCycle === 'weekly'}
          />
        ) : null}
        <QuotaRow
          label="Tokens na janela"
          used={usage.windowUsedTokens}
          limit={windowLimit}
          loading={usage.loading}
          active={usage.bindingCycle === 'window'}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { gap: 4 },
  title: { color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  row: { gap: 6, padding: 8, marginHorizontal: -8, borderRadius: 10 },
  rowActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: tokens.textMid, fontSize: 13, fontWeight: '500' },
  rowLabelActive: { color: tokens.accentText, fontWeight: '600' },
  rowCount: { color: tokens.textLow, fontSize: 12 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.glassStrong,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  meta: { color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  metaSub: { color: tokens.textLow, fontSize: 12 },
  bindingHint: { color: tokens.accentText, fontSize: 12, fontWeight: '600' },
  unlimited: { color: tokens.textMid, fontSize: 13 },
});
