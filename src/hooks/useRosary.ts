import { useCallback, useMemo, useState } from 'react';

export type RosaryMysterySet = 'joyful' | 'sorrowful' | 'glorious' | 'luminous';

export function getMysterySetForToday(): RosaryMysterySet {
  const day = new Date().getDay();
  switch (day) {
    case 0: // Domingo
      return 'glorious';
    case 1: // Segunda
      return 'joyful';
    case 2: // Terça
      return 'sorrowful';
    case 3: // Quarta
      return 'glorious';
    case 4: // Quinta
      return 'luminous';
    case 5: // Sexta
      return 'sorrowful';
    case 6: // Sábado
      return 'joyful';
    default:
      return 'joyful';
  }
}

export type RosaryMystery = {
  name: string;
  set: RosaryMysterySet;
  position: number;
};

const MYSTERIES: Record<RosaryMysterySet, string[]> = {
  joyful: [
    'a Anunciação de Maria',
    'a Visitação de Maria a Isabel',
    'o Nascimento de Jesus',
    'a Apresentação de Jesus no Templo',
    'a Perda e Reencontro de Jesus no Templo',
  ],
  sorrowful: [
    'a Agonia de Jesus no Horto',
    'a Flagelação de Jesus',
    'a Coroação de Espinhos',
    'a Subida de Jesus ao Calvário',
    'a Crucificação e Morte de Jesus',
  ],
  glorious: [
    'a Ressurreição de Jesus',
    'a Ascensão de Jesus',
    'a Vinda do Espírito Santo',
    'a Assunção de Maria',
    'a Coroação de Maria como Rainha do Céu',
  ],
  luminous: [
    'o Batismo de Jesus no Jordão',
    'a Auto-revelação nas Bodas de Caná',
    'o Anúncio do Reino de Deus',
    'a Transfiguração de Jesus',
    'a Instituição da Eucaristia',
  ],
};

export type RosaryStep =
  | 'cross'
  | 'creed'
  | 'our_father_opening'
  | 'hail_mary_3'
  | 'glory_opening'
  | 'mystery_intro'
  | 'mystery_our_father'
  | 'mystery_hail_mary'
  | 'mystery_glory'
  | 'finished';

export type RosaryState = {
  active: boolean;
  mysterySet: RosaryMysterySet;
  currentMysteryIndex: number;
  step: RosaryStep;
  hailMaryCount: number;
  intention: string;
};

export type RosaryAction =
  | { type: 'start'; mysterySet?: RosaryMysterySet; intention?: string }
  | { type: 'advance' }
  | { type: 'stop' };

export function useRosary() {
  const [state, setState] = useState<RosaryState>({
    active: false,
    mysterySet: getMysterySetForToday(),
    currentMysteryIndex: 0,
    step: 'cross',
    hailMaryCount: 0,
    intention: '',
  });

  const mysteries = useMemo(
    () => MYSTERIES[state.mysterySet].map((name, i) => ({ name, set: state.mysterySet, position: i + 1 })),
    [state.mysterySet],
  );

  const currentMystery = useMemo<RosaryMystery | null>(() => {
    if (!state.active) return null;
    const name = MYSTERIES[state.mysterySet][state.currentMysteryIndex];
    if (!name) return null;
    return { name, set: state.mysterySet, position: state.currentMysteryIndex + 1 };
  }, [state]);

  const dispatch = useCallback((action: RosaryAction) => {
    setState((prev) => {
      if (action.type === 'start') {
        return {
          active: true,
          mysterySet: action.mysterySet ?? getMysterySetForToday(),
          currentMysteryIndex: 0,
          step: 'cross',
          hailMaryCount: 0,
          intention: action.intention ?? '',
        };
      }
      if (action.type === 'stop') {
        return { ...prev, active: false };
      }
      if (action.type === 'advance') {
        return advanceState(prev);
      }
      return prev;
    });
  }, []);

  return {
    state,
    mysteries,
    currentMystery,
    dispatch,
  };
}

function advanceState(prev: RosaryState): RosaryState {
  const next = { ...prev };

  switch (prev.step) {
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

export function getStepText(state: RosaryState): string | null {
  switch (state.step) {
    case 'cross':
      return 'Em nome do Pai, do Filho e do Espírito Santo. Amém.';
    case 'creed':
      return 'Creio em Deus Pai todo-poderoso...';
    case 'our_father_opening':
      return 'Pai Nosso que estais nos céus, santificado seja o vosso nome...';
    case 'hail_mary_3':
      return 'Ave Maria, cheia de graça, o Senhor é convosco...';
    case 'glory_opening':
      return 'Glória ao Pai, ao Filho e ao Espírito Santo...';
    case 'mystery_intro':
      return currentMysteryName(state)
        ? `No ${currentMysteryName(state)}, meditamos...`
        : null;
    case 'mystery_our_father':
      return 'Pai Nosso...';
    case 'mystery_hail_mary':
      return 'Ave Maria...';
    case 'mystery_glory':
      return 'Glória ao Pai...';
    case 'finished':
      return 'Terço finalizado. Salve, Rainha! Amém.';
    default:
      return null;
  }
}

export function currentMysteryName(state: RosaryState): string | null {
  return MYSTERIES[state.mysterySet][state.currentMysteryIndex] ?? null;
}

export function isPrayerMatch(text: string, step: RosaryStep): boolean {
  const lower = text.toLowerCase();
  switch (step) {
    case 'cross':
      return lower.includes('em nome do pai') || lower.includes('sinal da cruz');
    case 'creed':
      return lower.includes('creio em deus') || lower.includes('creio');
    case 'our_father_opening':
    case 'mystery_our_father':
      return lower.includes('pai nosso') || lower.includes('pai nosso que estais');
    case 'hail_mary_3':
    case 'mystery_hail_mary':
      return lower.includes('ave maria') || lower.includes('cheia de graça');
    case 'glory_opening':
    case 'mystery_glory':
      return lower.includes('gloria ao pai') || lower.includes('glória ao pai');
    case 'mystery_intro':
      return lower.includes('meditamos') || lower.includes('contemplamos') || lower.includes('misterio');
    case 'finished':
      return lower.includes('salve rainha') || lower.includes('amém');
    default:
      return false;
  }
}

export function getHailMaryOrdinal(n: number): string {
  const map: Record<number, string> = {
    1: 'primeira',
    2: 'segunda',
    3: 'terceira',
    4: 'quarta',
    5: 'quinta',
    6: 'sexta',
    7: 'sétima',
    8: 'oitava',
    9: 'nona',
    10: 'décima',
  };
  return map[n] ?? `${n}ª`;
}

export function formatRosaryProgress(state: RosaryState): string {
  if (!state.active) return 'Terço';
  const mystery = currentMysteryName(state);
  if (state.step === 'finished') return 'Terço finalizado';
  if (!mystery) return 'Terço';
  if (state.step === 'mystery_hail_mary') {
    return `Mistério ${state.currentMysteryIndex + 1}/5 · ${getHailMaryOrdinal(state.hailMaryCount)} Ave Maria`;
  }
  return `Mistério ${state.currentMysteryIndex + 1}/5`;
}
