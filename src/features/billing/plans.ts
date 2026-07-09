import type { LunaPlanId } from './types';
import { formatarTokens, FREE_QUOTA_WINDOW_HOURS, WEEKLY_TOKEN_LIMITS, WINDOW_TOKEN_LIMITS } from './planQuotas';

export type PlanFeature = {
  label: string;
  available: boolean | 'limited';
  detail?: string;
};

export type PlanConfig = {
  id: LunaPlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceAnnual: number | null;
  priceAnnualMonthly: number | null;
  cloudTurns: number | null;
  features: PlanFeature[];
  highlighted?: boolean;
  badge?: string;
};

function tokenLimitDetail(planId: LunaPlanId): string {
  const window = formatarTokens(WINDOW_TOKEN_LIMITS[planId]);
  const weekly = formatarTokens(WEEKLY_TOKEN_LIMITS[planId]);
  return `${window} a cada ${FREE_QUOTA_WINDOW_HOURS} h · ${weekly}/semana`;
}

function approxTurnsPerWindow(planId: LunaPlanId): string {
  const turns = Math.floor(WINDOW_TOKEN_LIMITS[planId] / 12_500);
  return `~${turns} conversas por janela`;
}

/** Planos com copy orientada ao utilizador mobile (sem jargão de dev). */
export const PLANS: PlanConfig[] = [
  {
    id: 'free',
    name: 'Grátis',
    tagline: 'Para conhecer a Luna',
    priceMonthly: 0,
    priceAnnual: null,
    priceAnnualMonthly: null,
    cloudTurns: null,
    features: [
      { label: 'Tokens na nuvem', available: 'limited', detail: tokenLimitDetail('free') },
      { label: 'Uso típico', available: 'limited', detail: approxTurnsPerWindow('free') },
      { label: 'Luna Core', available: false, detail: 'Luna Plus' },
      { label: 'Histórico na nuvem', available: true },
      { label: 'Memória entre conversas', available: 'limited' },
      { label: 'Sincronização entre dispositivos', available: false },
    ],
  },
  {
    id: 'plus',
    name: 'Luna Plus',
    tagline: 'Uso diário com folga',
    priceMonthly: 39,
    priceAnnual: 390,
    priceAnnualMonthly: 32.5,
    cloudTurns: null,
    features: [
      { label: 'Tokens na nuvem', available: 'limited', detail: tokenLimitDetail('plus') },
      { label: 'Uso típico', available: 'limited', detail: approxTurnsPerWindow('plus') },
      { label: 'Luna Core', available: true },
      { label: 'Memória global', available: true },
      { label: 'Sincronização entre dispositivos', available: true },
      { label: 'Prioridade nas respostas', available: false },
    ],
  },
  {
    id: 'pro',
    name: 'Luna Pro',
    tagline: 'Potência premium para uso intenso',
    priceMonthly: 79,
    priceAnnual: 790,
    priceAnnualMonthly: 65.83,
    cloudTurns: null,
    highlighted: true,
    badge: 'Recomendado',
    features: [
      { label: 'Tokens na nuvem', available: 'limited', detail: tokenLimitDetail('pro') },
      { label: 'Uso típico', available: 'limited', detail: approxTurnsPerWindow('pro') },
      { label: 'Luna Core', available: true },
      { label: 'Memória global completa', available: true },
      { label: 'Sincronização entre dispositivos', available: true },
      { label: 'Prioridade nas respostas', available: true },
    ],
  },
];

export function getPlan(id: LunaPlanId): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
}

export const PLAN_DISPLAY_LABELS: Record<LunaPlanId, string> = {
  free: 'Grátis',
  plus: 'Plus',
  pro: 'Pro',
  byok: 'BYOK',
  team: 'Team',
};

/** Planos visíveis no mobile (sem BYOK — específico do desktop). */
export const MOBILE_CHECKOUT_PLANS = PLANS.filter((p) => p.id === 'plus' || p.id === 'pro');
