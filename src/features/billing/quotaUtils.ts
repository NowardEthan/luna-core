import type { MessageActionFeedback } from '../../lib/messageActions';
import { formatResetPrecise, formatarTokens } from './planQuotas';
import { CUSTO_MINIMO_CHAT } from './tokenEstimate';
import type { LunaUsageSnapshot } from './useLunaUsage';

export function remainingTokens(usage: LunaUsageSnapshot): number | null {
  return usage.remainingTokens;
}

export function hasLimitedQuotas(usage: LunaUsageSnapshot): boolean {
  return usage.windowTokenLimit !== null;
}

/** Conta na nuvem (inclui visitante anónimo) com algum limite activo. */
export function quotaApplies(
  cloudEnabled: boolean,
  _isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  return cloudEnabled && hasLimitedQuotas(usage);
}

export function canAffordTokens(usage: LunaUsageSnapshot, cost: number): boolean {
  if (!hasLimitedQuotas(usage)) return true;
  if (usage.loading) return true;
  const remaining = usage.remainingTokens;
  if (remaining === null) return true;
  return remaining >= cost;
}

export function canSendCloudTurn(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  if (usage.loading) return true;
  if (canAffordTokens(usage, CUSTO_MINIMO_CHAT)) return true;
  const reduced = usage.reducedMode;
  return Boolean(reduced?.available && reduced.dailyRemaining > 0);
}

/** Plano esgotado mas ainda há fallback Cerebras free. */
export function isReducedModeOnly(usage: LunaUsageSnapshot): boolean {
  if (!hasLimitedQuotas(usage)) return false;
  if (usage.loading) return false;
  const planDepleted = (usage.remainingTokens ?? 0) < CUSTO_MINIMO_CHAT;
  const reduced = usage.reducedMode;
  return planDepleted && Boolean(reduced?.available && reduced.dailyRemaining > 0);
}

export function canAnalyzeImages(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
  count: number,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canAffordTokens(usage, count * 2_500);
}

export function canExtractDocuments(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
  count: number,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canAffordTokens(usage, count * 4_000);
}

export function canTranscribeVoice(
  cloudEnabled: boolean,
  isAnonymous: boolean,
  usage: LunaUsageSnapshot,
): boolean {
  if (!quotaApplies(cloudEnabled, isAnonymous, usage)) return true;
  return canAffordTokens(usage, 800);
}

function resetDetail(usage: LunaUsageSnapshot): string {
  if (usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null) {
    return formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now());
  }
  if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    return formatResetPrecise(usage.resetsAtMs - Date.now());
  }
  if (usage.resetDays != null) {
    return `em ${usage.resetDays} dias`;
  }
  return 'em breve';
}

export function feedbackQuotaExceeded(usage: LunaUsageSnapshot): MessageActionFeedback {
  const reduced = usage.reducedMode;
  if (reduced && !reduced.available && reduced.dailyRemaining <= 0) {
    return {
      id: `quota-reduced-${Date.now()}`,
      kind: 'quota',
      role: 'luna',
      title: 'Modo reduzido esgotado',
      detail: `Limite diário do tier free (${reduced.dailyLimit.toLocaleString('pt-BR')} tokens) atingido. Renova ${formatResetPrecise(reduced.resetsAtMs - Date.now())}.`,
    };
  }

  const weekly = usage.weeklyTokens;
  const weeklyExceeded =
    usage.bindingCycle === 'weekly' && weekly != null && weekly.remaining <= 0;
  const limit = weeklyExceeded ? weekly.limit : usage.effectiveLimit;
  const used = weeklyExceeded ? weekly.used : usage.usedTokens;
  const cycle = weeklyExceeded
    ? 'esta semana'
    : usage.cycle === 'window' && usage.windowHours
      ? `a cada ${usage.windowHours} h`
      : 'este mês';

  return {
    id: `quota-tokens-${Date.now()}`,
    kind: 'quota',
    role: 'luna',
    title: weeklyExceeded ? 'Limite semanal de tokens atingido' : 'Limite de tokens atingido',
    detail: `${formatarTokens(used)} / ${limit != null ? formatarTokens(limit) : '—'} tokens ${cycle}. Renova ${resetDetail(usage)}.`,
  };
}
