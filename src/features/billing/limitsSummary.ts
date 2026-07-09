import { formatResetPrecise, FREE_QUOTA_WINDOW_HOURS, formatarTokens } from './planQuotas';
import type { LunaUsageSnapshot } from './useLunaUsage';

/** Uma linha para a linha de Ajustes. */
export function limitsSettingsDetail(
  usage: LunaUsageSnapshot,
  remaining: number | null,
  exceeded: boolean,
): string {
  if (usage.loading) return 'Carregando…';
  if (usage.cycle === 'unlimited') return 'Uso ilimitado';
  if (exceeded) {
    if (usage.reducedMode?.available) {
      return 'Plano esgotado — modo reduzido disponível';
    }
    return 'Limite atingido — toque para detalhes';
  }
  if (remaining != null) return `${formatarTokens(remaining)} tokens restantes`;
  return 'Ver consumo do plano';
}

/** Número grande no topo do ecrã Limites. */
export function limitsHeroRemaining(remaining: number | null, exceeded: boolean): string {
  if (exceeded) return '0';
  if (remaining == null) return '—';
  return formatarTokens(remaining);
}

export function limitsHeroSubtitle(
  usage: LunaUsageSnapshot,
  exceeded: boolean,
): string {
  if (usage.loading) return 'Atualizando uso…';
  if (usage.cycle === 'unlimited') return 'Sem limites neste plano';
  if (exceeded) {
    if (usage.reducedMode?.available) {
      return 'Plano esgotado — modo reduzido (OSS) ativo';
    }
    return usage.bindingCycle === 'weekly'
      ? 'Limite semanal de tokens atingido'
      : `Limite da janela de ${FREE_QUOTA_WINDOW_HOURS} h atingido`;
  }
  if (usage.bindingCycle === 'weekly' && usage.weeklyTokens?.resetsAtMs != null) {
    return `Semana renova ${formatResetPrecise(usage.weeklyTokens.resetsAtMs - Date.now())}`;
  }
  if (usage.cycle === 'window' && usage.resetsAtMs != null) {
    return `Janela renova ${formatResetPrecise(usage.resetsAtMs - Date.now())}`;
  }
  if (usage.resetDays != null) {
    return `Renova em ${usage.resetDays} dias`;
  }
  return 'Tokens na nuvem';
}

/** Placeholder do composer quando quota esgotada. */
export function quotaComposerPlaceholder(
  usage: LunaUsageSnapshot,
  exceeded: boolean,
  fallback: string,
  reduced?: boolean,
): string {
  if (reduced) {
    return 'Modo reduzido — modelo econômico (OSS)';
  }
  if (!exceeded) return fallback;
  if (usage.bindingCycle === 'weekly') {
    return 'Limite semanal atingido — veja Ajustes → Limites';
  }
  if (usage.cycle === 'window') {
    return `Limite da janela de ${FREE_QUOTA_WINDOW_HOURS} h — veja Ajustes → Limites`;
  }
  return 'Limite de tokens atingido';
}
