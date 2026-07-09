import { formatResetPrecise, formatarTokens } from './planQuotas';
import type { LunaUsageSnapshot } from './useLunaUsage';

export type UsageStatusTone = 'normal' | 'warn' | 'danger';

export type UsageCompactBadge = {
  label: string;
  tone: UsageStatusTone;
  accessibilityLabel: string;
};

function weeklyPressureSuffix(usage: LunaUsageSnapshot): string | null {
  const weekly = usage.weeklyTokens;
  if (usage.cycle !== 'window' || weekly == null || usage.bindingCycle === 'weekly') return null;
  const pct = weekly.limit > 0 ? weekly.used / weekly.limit : 0;
  if (pct < 0.8) return null;
  return `${formatarTokens(weekly.used)}/${formatarTokens(weekly.limit)} sem.`;
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
      accessibilityLabel: 'Limite de tokens atingido. Toque para ver planos.',
    };
  }

  if (remaining == null) return null;

  const tone: UsageStatusTone =
    remaining <= Math.max(500, Math.ceil(limit * 0.1)) ? 'warn' : 'normal';

  const count = formatarTokens(remaining);
  const weeklySuffix = weeklyPressureSuffix(usage);
  let label: string;

  if (usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null) {
    label = `${count} · sem.`;
  } else if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    const windowPart = `${count} · ${formatResetPrecise(usage.resetsAtMs - Date.now())}`;
    label = weeklySuffix ? `${windowPart} · ${weeklySuffix}` : windowPart;
  } else {
    label = `${count} tokens`;
  }

  const resetDetail =
    usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null
      ? formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now())
      : usage.cycle === 'window' && usage.resetsAtMs != null
        ? formatResetPrecise(usage.resetsAtMs - Date.now())
        : usage.resetDays != null
          ? `renova em ${usage.resetDays} dias`
          : null;

  const weeklyNote =
    weeklySuffix != null
      ? ` Uso semanal: ${formatarTokens(usage.weeklyTokens!.used)} de ${formatarTokens(usage.weeklyTokens!.limit)}.`
      : '';

  return {
    label,
    tone,
    accessibilityLabel: resetDetail
      ? `${formatarTokens(remaining)} tokens restantes. ${resetDetail}.${weeklyNote}`
      : `${formatarTokens(remaining)} tokens restantes.${weeklyNote}`,
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
