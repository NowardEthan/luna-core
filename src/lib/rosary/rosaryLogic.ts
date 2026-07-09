import type { RosaryState, RosaryStep } from '../../hooks/useRosary';

export type PrayerMode = 'solo' | 'together';

export const ROSARY_BEAD_TOTAL = 59;

const HAIL_MARY_KEYWORDS = [
  'ave maria',
  'cheia de graca',
  'mae de deus',
  'santa maria',
  'bendita sois',
  'fruto do vosso ventre',
  'rogai por nos',
];

const KEYWORDS: Record<RosaryStep, string[]> = {
  intro: ['vamos', 'sim', 'comecamos', 'começamos', 'bora', 'pode ser', 'direto', 'intencao', 'intenção'],
  cross: ['em nome do pai', 'sinal da cruz', 'pai filho espirito'],
  creed: ['creio em deus', 'espirito santo', 'igreja catolica', 'vida eterna'],
  our_father_opening: ['pai nosso', 'pao nosso', 'venha a nos o vosso reino'],
  hail_mary_3: HAIL_MARY_KEYWORDS,
  glory_opening: ['gloria ao pai', 'como era no principio'],
  mystery_intro: ['amen', 'amem', 'meditamos', 'contemplamos', 'sim', 'vamos'],
  mystery_our_father: ['pai nosso', 'pao nosso'],
  mystery_hail_mary: HAIL_MARY_KEYWORDS,
  mystery_glory: ['gloria ao pai', 'como era no principio'],
  finished: ['salve rainha', 'salve regina', 'mãe de misericordia', 'mae de misericordia'],
};

function keywordMatchRatio(normalized: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (normalized.includes(kw)) hits += 1;
  }
  return hits / keywords.length;
}

/** Normaliza texto para comparação tolerante (typos, acentos). */
export function normalizePrayerText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHailMaryStep(step: RosaryStep): boolean {
  return step === 'hail_mary_3' || step === 'mystery_hail_mary';
}

/** Aceita oração se ≥40% das palavras-chave do passo aparecem. */
export function matchPrayerText(
  text: string,
  step: RosaryStep,
  prayerMode?: PrayerMode | null,
): boolean {
  const normalized = normalizePrayerText(text);
  if (normalized.length < 2) return false;

  if (prayerMode === 'together' && isHailMaryStep(step)) {
    if (HAIL_MARY_KEYWORDS.some((kw) => normalized.includes(kw))) return true;
    if (normalized === 'amen' || normalized === 'amem' || normalized.endsWith(' amen') || normalized.endsWith(' amem')) {
      return true;
    }
  }

  const keywords = KEYWORDS[step];
  if (keywords.some((kw) => normalized.includes(kw))) return true;
  const ratio = keywordMatchRatio(normalized, keywords);
  if (ratio >= 0.4) return true;

  // Atalhos curtos
  if ((step === 'mystery_intro' || step === 'cross') && (normalized === 'amen' || normalized === 'amem')) {
    return true;
  }

  return false;
}

const STOP_TRIGGERS = [
  'parar terço',
  'parar o terço',
  'encerrar terço',
  'sair do terço',
  'cancelar terço',
  'parar de rezar',
  'quero parar',
];

export function isStopRosaryRequest(text: string): boolean {
  const n = normalizePrayerText(text);
  return STOP_TRIGGERS.some((t) => n.includes(normalizePrayerText(t)));
}

const INTENTION_HINTS = ['intenção', 'intencao', 'quero rezar por', 'rezar por', 'pelo', 'pela', 'em favor'];

export function isIntentionMessage(text: string): boolean {
  const n = normalizePrayerText(text);
  if (n.length < 4) return false;
  return INTENTION_HINTS.some((h) => n.includes(normalizePrayerText(h)));
}

export type RosaryIntent =
  | { kind: 'start_rosary' }
  | { kind: 'stop_rosary' }
  | { kind: 'prayer' }
  | { kind: 'intention' }
  | { kind: 'kickoff' }
  | { kind: 'chat' };

const KICKOFF_EXACT = [
  'vamos',
  'sim',
  'começamos',
  'comecamos',
  'bora',
  'pode ser',
  'direto',
  'sem intencao',
  'sem intenção',
  'sinal da cruz',
  'pode comecar',
  'pode começar',
  'vai',
  'ok',
  'beleza',
  'tudo bem',
];

const KICKOFF_PREFIX = ['vamos', 'sim', 'bora', 'ok', 'vai'];

const INTRO_NOISE = [
  'oi',
  'ola',
  'hey',
  'ei',
  'kk',
  'kkk',
  'haha',
  'rs',
  'obrigado',
  'obrigada',
  'obg',
  'vlw',
  'valeu',
  'bom dia',
  'boa tarde',
  'boa noite',
];

export function isIntroNoise(text: string): boolean {
  const n = normalizePrayerText(text);
  if (n.length === 0) return true;
  if (n.length <= 2) return true;
  if (INTRO_NOISE.some((noise) => n === normalizePrayerText(noise))) return true;
  if (/^[\?\!\.]+$/.test(text.trim())) return true;
  return false;
}

export function isKickoffMessage(text: string): boolean {
  const n = normalizePrayerText(text);
  if (n.length < 2) return false;

  if (KICKOFF_EXACT.some((t) => n === normalizePrayerText(t))) return true;

  const words = n.split(' ').filter(Boolean);
  if (words.length > 4) return false;

  return KICKOFF_PREFIX.some((t) => {
    const trigger = normalizePrayerText(t);
    return n === trigger || n.startsWith(`${trigger} `) || n.endsWith(` ${trigger}`) || n.includes(` ${trigger} `);
  });
}

export function classifyRosaryIntentLocal(
  text: string,
  state: RosaryState,
  isRosaryRequest: (t: string) => boolean,
  prayerMode?: PrayerMode | null,
): RosaryIntent {
  if (!state.active && isRosaryRequest(text)) return { kind: 'start_rosary' };
  if (state.active && isStopRosaryRequest(text)) return { kind: 'stop_rosary' };

  if (state.active && state.step === 'intro') {
    if (matchPrayerText(text, 'cross', prayerMode)) return { kind: 'prayer' };
    if (isKickoffMessage(text)) return { kind: 'kickoff' };
    if (isIntroNoise(text)) return { kind: 'chat' };
    return { kind: 'intention' };
  }

  if (state.active && matchPrayerText(text, state.step, prayerMode)) return { kind: 'prayer' };
  if (state.active && !state.intention && isIntentionMessage(text)) return { kind: 'intention' };
  if (!state.active) return { kind: 'chat' };
  return { kind: 'chat' };
}

function computeProgressBead(state: RosaryState): number {
  const { step, hailMaryCount, currentMysteryIndex } = state;

  if (step === 'intro') return 0;
  if (step === 'cross') return 1;
  if (step === 'creed') return 2;
  if (step === 'our_father_opening') return 3;
  if (step === 'hail_mary_3') return 3 + hailMaryCount;
  if (step === 'glory_opening') return 7;
  if (step === 'finished') return ROSARY_BEAD_TOTAL;

  const decadeStart = 8 + currentMysteryIndex * 10;
  if (step === 'mystery_intro' || step === 'mystery_our_father') return decadeStart;
  if (step === 'mystery_hail_mary') {
    return Math.min(decadeStart + hailMaryCount, ROSARY_BEAD_TOTAL - 1);
  }
  if (step === 'mystery_glory') {
    return Math.min(decadeStart + 10, ROSARY_BEAD_TOTAL - 1);
  }

  return 1;
}

/** Índice de conta 1–59 para o HUD visual. */
export function computeBeadProgress(state: RosaryState): { current: number; total: number } {
  if (!state.active) return { current: 0, total: ROSARY_BEAD_TOTAL };
  return { current: computeProgressBead(state), total: ROSARY_BEAD_TOTAL };
}

export function advanceRosaryState(prev: RosaryState): RosaryState {
  const next = { ...prev };

  switch (prev.step) {
    case 'intro':
      next.step = 'cross';
      break;
    case 'cross':
      next.step = 'creed';
      break;
    case 'creed':
      next.step = 'our_father_opening';
      break;
    case 'our_father_opening':
      next.step = 'hail_mary_3';
      next.hailMaryCount = 1;
      break;
    case 'hail_mary_3':
      if (prev.hailMaryCount < 3) {
        next.hailMaryCount = prev.hailMaryCount + 1;
      } else {
        next.step = 'glory_opening';
        next.hailMaryCount = 0;
      }
      break;
    case 'glory_opening':
      next.step = 'mystery_intro';
      break;
    case 'mystery_intro':
      next.step = 'mystery_our_father';
      break;
    case 'mystery_our_father':
      next.step = 'mystery_hail_mary';
      next.hailMaryCount = 1;
      break;
    case 'mystery_hail_mary':
      if (prev.hailMaryCount < 10) {
        next.hailMaryCount = prev.hailMaryCount + 1;
      } else {
        next.step = 'mystery_glory';
        next.hailMaryCount = 0;
      }
      break;
    case 'mystery_glory':
      if (prev.currentMysteryIndex < 4) {
        next.currentMysteryIndex = prev.currentMysteryIndex + 1;
        next.step = 'mystery_intro';
      } else {
        next.step = 'finished';
      }
      break;
    case 'finished':
      next.active = false;
      break;
  }

  return next;
}
