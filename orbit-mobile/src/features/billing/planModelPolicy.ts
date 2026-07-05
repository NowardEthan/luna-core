import type { LunaPlanId } from './types';

/** GLM 4.7 / Luna Profunda — bloqueado no plano Grátis. */
export function isPremiumModelAllowed(planId: LunaPlanId): boolean {
  return planId !== 'free';
}

export function isGlm47Provider(providerId?: string, modelKey?: string): boolean {
  return providerId === 'cerebras' || modelKey === 'glm-47';
}

export function filterProviderOptionsForPlan<T extends { providerId: string; modelKey: string }>(
  planId: LunaPlanId,
  options: T[],
): T[] {
  if (isPremiumModelAllowed(planId)) return options;
  return options.filter((o) => !isGlm47Provider(o.providerId, o.modelKey));
}

export const FREE_PLAN_DEFAULT_PROVIDER = {
  providerId: 'groq' as const,
  modelKey: 'default' as const,
};

export const FREE_PLAN_AUTO_DESCRIPTION =
  'Clarão por padrão no Grátis. Luna Profunda disponível no Plus.';
