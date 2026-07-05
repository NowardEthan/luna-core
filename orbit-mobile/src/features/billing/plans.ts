import type { LunaPlanId } from './types';

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
      { label: 'Mensagens na nuvem', available: 'limited', detail: '15 a cada 3 h' },
      { label: 'Imagens analisadas', available: 'limited', detail: '5 a cada 3 h' },
      { label: 'Arquivos lidos', available: 'limited', detail: '3 a cada 3 h' },
      { label: 'Transcrições de voz', available: 'limited', detail: '10 a cada 3 h' },
      { label: 'Luna Profunda', available: false, detail: 'Luna Plus' },
      { label: 'Histórico na nuvem', available: true },
      { label: 'Memória entre conversas', available: 'limited' },
      { label: 'Sincronização entre dispositivos', available: false },
    ],
  },
  {
    id: 'plus',
    name: 'Luna Plus',
    tagline: 'Uso diário tranquilo',
    priceMonthly: 25,
    priceAnnual: 250,
    priceAnnualMonthly: 20.83,
    cloudTurns: 1500,
    features: [
      { label: 'Mensagens na nuvem', available: true, detail: '1.500/mês' },
      { label: 'Luna Profunda', available: true },
      { label: 'Memória global', available: true },
      { label: 'Sincronização entre dispositivos', available: true },
      { label: 'Voz, imagens e documentos', available: true },
      { label: 'Prioridade nas respostas', available: false },
    ],
  },
  {
    id: 'pro',
    name: 'Luna Pro',
    tagline: 'Para quem usa todos os dias',
    priceMonthly: 49,
    priceAnnual: 490,
    priceAnnualMonthly: 40.83,
    cloudTurns: 5000,
    highlighted: true,
    badge: 'Recomendado',
    features: [
      { label: 'Mensagens na nuvem', available: true, detail: '5.000/mês' },
      { label: 'Luna Profunda', available: true },
      { label: 'Memória global completa', available: true },
      { label: 'Sincronização entre dispositivos', available: true },
      { label: 'Voz, imagens e documentos', available: true },
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
