import type { MessageActionFeedback } from '../../lib/messageActions';
import {
  formatResetPrecise,
  QUOTA_KIND_LABELS,
  type QuotaKind,
} from './planQuotas';
import type { LunaUsageSnapshot } from './useLunaUsage';

export function remainingForKind(usage: LunaUsageSnapshot, kind: QuotaKind): number | null {
  return usage.remaining[kind];
}

export function remainingTurns(usage: LunaUsageSnapshot): number | null {
  return remainingForKind(usage, 'messages');
}

export function hasLimitedQuotas(usage: LunaUsageSnapshot): boolean {
  return Object.values(usage.limits).some((v) => v !== null);
}

/** Conta na nuvem (inclui visitante anónimo) com algum limite activo. */
export function quotaApplies(
  cloudEnabled: boolean,
  _isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  return cloudEnabled && hasLimitedQuotas(usage);
}

export function canConsume(
  usage: LunaUsageSnapshot,
  kind: QuotaKind,
  amount = 1,
): boolean {
  const limit = usage.limits[kind];
  if (limit === null) return true;
  if (usage.loading) return true;
  return usage.used[kind] + amount <= limit;
}

export function canSendCloudTurn(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  if (usage.loading) return true;
  const remaining = remainingTurns(usage);
  if (remaining !== null && remaining < 1) return false;
  return canConsume(usage, 'messages', 1);
}

export function canAnalyzeImages(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
  count: number,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canConsume(usage, 'images', count);
}

export function canExtractDocuments(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
  count: number,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canConsume(usage, 'documents', count);
}

export function canTranscribeVoice(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canConsume(usage, 'voice', 1);
}

function resetDetail(usage: LunaUsageSnapshot): string {
  if (usage.bindingCycle === 'weekly' && usage.weeklyMessages?.resetsAtMs != null) {
    return formatResetPrecise(usage.weeklyMessages.resetsAtMs - Date.now());
  }
  if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    return formatResetPrecise(usage.resetsAtMs - Date.now());
  }
  if (usage.resetDays != null) {
    return `em ${usage.resetDays} dias`;
  }
  return 'em breve';
}

export function feedbackQuotaExceeded(
  usage: LunaUsageSnapshot,
  kind: QuotaKind = 'messages',
): MessageActionFeedback {
  const weekly = usage.weeklyMessages;
  const weeklyExceeded =
    kind === 'messages' &&
    usage.bindingCycle === 'weekly' &&
    weekly != null &&
    weekly.remaining <= 0;
  const limit = weeklyExceeded ? weekly.limit : usage.limits[kind];
  const used = weeklyExceeded ? weekly.used : usage.used[kind];
  const label = QUOTA_KIND_LABELS[kind].toLowerCase();
  const cycle = weeklyExceeded
    ? 'esta semana'
    : usage.cycle === 'window' && usage.windowHours
      ? `a cada ${usage.windowHours} h`
      : 'este mês';

  return {
    id: `quota-${kind}-${Date.now()}`,
    kind: 'quota',
    role: 'luna',
    title: weeklyExceeded ? `Limite semanal de ${label} atingido` : `Limite de ${label} atingido`,
    detail:
      kind === 'messages' && usage.cycle !== 'window' && !weeklyExceeded
        ? `${used}/${limit ?? '—'} ${cycle}. Renova ${resetDetail(usage)} ou faça upgrade em Ajustes → Planos.`
        : `${used}/${limit ?? '—'} ${cycle}. Renova ${resetDetail(usage)}.`,
  };
}
