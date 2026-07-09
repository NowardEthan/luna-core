import { useCallback, useEffect, useMemo, useState } from 'react';

import { advanceRosaryState, computeBeadProgress, matchPrayerText } from '../lib/rosary/rosaryLogic';
import { getCanonicalPrayer } from '../lib/rosary/rosaryTexts';
import { loadRosarySession, saveRosarySession, clearRosarySession } from '../lib/rosary/rosaryStorage';

export type RosaryMysterySet = 'joyful' | 'sorrowful' | 'glorious' | 'luminous';

export type PrayerMode = 'solo' | 'together';

export function getMysterySetForToday(): RosaryMysterySet {
  const day = new Date().getDay();
  switch (day) {
    case 0:
      return 'glorious';
    case 1:
      return 'joyful';
    case 2:
      return 'sorrowful';
    case 3:
      return 'glorious';
    case 4:
      return 'luminous';
    case 5:
      return 'sorrowful';
    case 6:
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
  | 'intro'
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
  | { type: 'stop' }
  | { type: 'set_intention'; intention: string }
  | { type: 'exit_intro' }
  | { type: 'restore'; state: RosaryState; prayerMode: PrayerMode | null };

const INITIAL_STATE: RosaryState = {
  active: false,
  mysterySet: getMysterySetForToday(),
  currentMysteryIndex: 0,
  step: 'cross',
  hailMaryCount: 0,
  intention: '',
};

export function useRosary(sessionId: string | null) {
  const [state, setState] = useState<RosaryState>(INITIAL_STATE);
  const [prayerMode, setPrayerMode] = useState<PrayerMode | null>(null);
  const [modeSheetVisible, setModeSheetVisible] = useState(false);
  const [pendingMysterySet, setPendingMysterySet] = useState<RosaryMysterySet | null>(null);

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

  const beadProgress = useMemo(() => computeBeadProgress(state), [state]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void loadRosarySession(sessionId).then((saved) => {
      if (cancelled || !saved?.state.active) return;
      setState(saved.state);
      setPrayerMode(saved.prayerMode);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !state.active) return;
    void saveRosarySession(sessionId, { state, prayerMode });
  }, [sessionId, state, prayerMode]);

  const dispatch = useCallback((action: RosaryAction) => {
    setState((prev) => {
      if (action.type === 'start') {
        return {
          active: true,
          mysterySet: action.mysterySet ?? getMysterySetForToday(),
          currentMysteryIndex: 0,
          step: 'intro',
          hailMaryCount: 0,
          intention: action.intention ?? '',
        };
      }
      if (action.type === 'stop') {
        return { ...prev, active: false };
      }
      if (action.type === 'set_intention') {
        return {
          ...prev,
          intention: action.intention,
          step: prev.step === 'intro' ? 'cross' : prev.step,
        };
      }
      if (action.type === 'exit_intro') {
        if (prev.step !== 'intro') return prev;
        return { ...prev, step: 'cross' };
      }
      if (action.type === 'restore') {
        setPrayerMode(action.prayerMode);
        return action.state;
      }
      if (action.type === 'advance') {
        const next = advanceRosaryState(prev);
        return next;
      }
      return prev;
    });
  }, [sessionId]);

  const requestStart = useCallback((mysterySet?: RosaryMysterySet) => {
    if (state.active) return;
    setPendingMysterySet(mysterySet ?? getMysterySetForToday());
    setModeSheetVisible(true);
  }, [state.active]);

  const confirmStartWithMode = useCallback(
    (mode: PrayerMode) => {
      const set = pendingMysterySet ?? getMysterySetForToday();
      setPrayerMode(mode);
      setModeSheetVisible(false);
      setPendingMysterySet(null);
      dispatch({ type: 'start', mysterySet: set });
    },
    [dispatch, pendingMysterySet],
  );

  const cancelModeSheet = useCallback(() => {
    setModeSheetVisible(false);
    setPendingMysterySet(null);
  }, []);

  const stopRosary = useCallback(() => {
    if (sessionId) void clearRosarySession(sessionId);
    setPrayerMode(null);
    dispatch({ type: 'stop' });
  }, [dispatch, sessionId]);

  const setMode = useCallback((mode: PrayerMode) => {
    setPrayerMode(mode);
  }, []);

  return {
    state,
    prayerMode,
    modeSheetVisible,
    pendingMysterySet,
    mysteries,
    currentMystery,
    beadProgress,
    dispatch,
    requestStart,
    confirmStartWithMode,
    cancelModeSheet,
    setMode,
    stopRosary,
  };
}

export function currentMysteryName(state: RosaryState): string | null {
  return MYSTERIES[state.mysterySet][state.currentMysteryIndex] ?? null;
}

export function isRosaryRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const triggers = [
    'rezar terço',
    'rezar o terço',
    'rezar um terço',
    'vamos rezar o terço',
    'vamos rezar um terço',
    'iniciar terço',
    'começar terço',
    'modo terço',
    'terço com luna',
    'rezar o rosario',
    'rezar o rosário',
  ];
  return triggers.some((t) => lower.includes(t));
}

export function isPrayerMatch(text: string, step: RosaryStep): boolean {
  return matchPrayerText(text, step);
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
  if (state.step === 'intro') return 'Preparação';
  if (state.step === 'finished') return 'Terço finalizado';

  if (state.step === 'cross') return 'Abertura · Sinal da cruz';
  if (state.step === 'creed') return 'Abertura · Credo';
  if (state.step === 'our_father_opening') return 'Abertura · Pai-Nosso';
  if (state.step === 'hail_mary_3') {
    return `Abertura · Ave-Maria ${state.hailMaryCount}/3`;
  }
  if (state.step === 'glory_opening') return 'Abertura · Glória';

  const mysteryNum = state.currentMysteryIndex + 1;
  if (state.step === 'mystery_intro') return `Mistério ${mysteryNum}/5 · Meditação`;
  if (state.step === 'mystery_our_father') return `Mistério ${mysteryNum}/5 · Pai-Nosso`;
  if (state.step === 'mystery_hail_mary') {
    return `Mistério ${mysteryNum}/5 · Ave-Maria ${state.hailMaryCount}/10`;
  }
  if (state.step === 'mystery_glory') return `Mistério ${mysteryNum}/5 · Glória`;

  return 'Terço';
}

/** @deprecated Usar rosaryTexts.getCanonicalPrayer */
export function getStepText(state: RosaryState): string | null {
  return getCanonicalPrayer(state);
}

export function isValidRosaryStep(value: unknown): value is RosaryStep {
  const steps: RosaryStep[] = [
    'intro',
    'cross',
    'creed',
    'our_father_opening',
    'hail_mary_3',
    'glory_opening',
    'mystery_intro',
    'mystery_our_father',
    'mystery_hail_mary',
    'mystery_glory',
    'finished',
  ];
  return typeof value === 'string' && steps.includes(value as RosaryStep);
}
