import { formatResetPrecise } from './planQuotas';
import type { LunaUsageSnapshot } from './useLunaUsage';

export type UsageStatusTone = 'normal' | 'warn' | 'danger';

export type UsageCompactBadge = {
  label: string;
  tone: UsageStatusTone;
  accessibilityLabel: string;
};

function formatCompactCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace('.0', '')}k`;
  }
  return n.toLocaleString('pt-BR');
}

/** Pill compacta — sempre visível quando há quota (não esconde com margem confortável). */
export function usageCompactBadge(
  usage: LunaUsageSnapshot,
  remaining: number | null,
  exceeded?: boolean,
): UsageCompactBadge | null {
  const limit = usage.effectiveLimit;
  if (limit === null || usage.cycle === 'unlimited' || usage.loading) return null;

  if (exceeded) {
    return {
      label: 'Limite',
      tone: 'danger',
      accessibilityLabel: 'Limite de mensagens atingido. Toque para ver planos.',
    };
  }

  if (remaining == null) return null;

  const tone: UsageStatusTone =
    remaining <= Math.max(3, Math.ceil(limit * 0.1))
      ? 'warn'
      : remaining <= Math.max(30, Math.ceil(limit * 0.2))
        ? 'normal'
        : 'normal';

  const count = formatCompactCount(remaining);
  let label: string;

  if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    label = `${count} · ${formatResetPrecise(usage.resetsAtMs - Date.now())}`;
  } else if (usage.resetDays != null) {
    label = `${count} msgs`;
  } else {
    label = `${count} msgs`;
  }

  const resetDetail =
    usage.cycle === 'window' && usage.resetsAtMs != null
      ? formatResetPrecise(usage.resetsAtMs - Date.now())
      : usage.resetDays != null
        ? `renova em ${usage.resetDays} dias`
        : null;

  return {
    label,
    tone,
    accessibilityLabel: resetDetail
      ? `${remaining} mensagens restantes. ${resetDetail}.`
      : `${remaining} mensagens restantes.`,
  };
}

/** @deprecated Preferir usageCompactBadge */
export function usageStatusSuffix(
  usage: LunaUsageSnapshot,
  remaining: number | null,
  exceeded?: boolean,
): { text: string; tone: UsageStatusTone } | null {
  const badge = usageCompactBadge(usage, remaining, exceeded);
  if (!badge) return null;
  return { text: badge.label, tone: badge.tone };
}
