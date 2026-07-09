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
  if (pct >= 90) return '#E57373';
  if (pct >= 70) return '#FFB74D';
  return tokens.accentBright;
}

function LimitBar({
  label,
  used,
  limit,
  loading,
  note,
  active,
}: {
  label: string;
  used: number;
  limit: number;
  loading?: boolean;
  note?: string;
  active?: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, Math.floor((used / limit) * 100)) : 0;
  return (
    <View style={[styles.barCard, active && styles.barCardActive]}>
      <View style={styles.barHeader}>
        <View style={styles.barTitleWrap}>
          <Text style={[styles.barLabel, active && styles.barLabelActive]}>{label}</Text>
          {active ? <Text style={styles.activeTag}>limita agora</Text> : null}
        </View>
        <Text style={styles.barCount}>
          {loading ? '…' : `${formatarTokens(used)} / ${formatarTokens(limit)}`}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${loading ? 0 : pct}%`, backgroundColor: barColor(pct) }]}
        />
      </View>
      {note ? <Text style={styles.barNote}>{note}</Text> : null}
    </View>
  );
}

/** Detalhe de consumo — só no ecrã Limites. */
export function LimitsDetailPanel({ usage }: Props) {
  if (usage.cycle === 'unlimited') {
    return (
      <Text style={styles.unlimited}>Este plano não tem limites de uso na nuvem.</Text>
    );
  }

  if (usage.cycle === 'window') {
    const weeklyLimit = weeklyTokenLimitForPlan(usage.planId);
    const windowLimit = usage.windowTokenLimit ?? 0;

    const weeklyReset =
      usage.weeklyTokens?.resetsAtMs != null
        ? `Renova ${formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now())}`
        : undefined;
    const windowReset =
      usage.resetsAtMs != null && usage.bindingCycle === 'window'
        ? `Renova ${formatResetPrecise(usage.resetsAtMs - Date.now())}`
        : undefined;

    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionTitle}>Tokens</Text>
        <Text style={styles.sectionHint}>
          Mensagens, imagens, voz e arquivos consomem do mesmo saldo. O gasto na janela de{' '}
          {FREE_QUOTA_WINDOW_HOURS} h também conta na semana.
        </Text>
        {weeklyLimit != null ? (
          <LimitBar
            label="Na semana"
            used={usage.weeklyTokens?.used ?? 0}
            limit={weeklyLimit}
            loading={usage.loading}
            note={weeklyReset}
            active={usage.bindingCycle === 'weekly'}
          />
        ) : null}
        <LimitBar
          label={`Na janela (${FREE_QUOTA_WINDOW_HOURS} h)`}
          used={usage.windowUsedTokens}
          limit={windowLimit}
          loading={usage.loading}
          note={windowReset}
          active={usage.bindingCycle === 'window'}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  sectionTitle: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionHint: {
    color: tokens.textLow,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  barCard: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
  },
  barCardActive: {
    borderColor: 'rgba(167, 139, 250, 0.35)',
    backgroundColor: 'rgba(167, 139, 250, 0.06)',
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  barTitleWrap: { flex: 1, gap: 4 },
  barLabel: { color: tokens.textMid, fontSize: 14, fontWeight: '500' },
  barLabelActive: { color: tokens.accentText, fontWeight: '600' },
  activeTag: {
    color: tokens.accentBright,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  barCount: { color: tokens.textLow, fontSize: 13, fontVariant: ['tabular-nums'] },
  barNote: { color: tokens.textLow, fontSize: 12 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  unlimited: { color: tokens.textMid, fontSize: 14, lineHeight: 20 },
});
