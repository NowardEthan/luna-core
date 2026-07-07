import { describe, expect, it } from 'vitest';

import {
  advanceRosaryState,
  classifyRosaryIntentLocal,
  computeBeadProgress,
  matchPrayerText,
} from '../../../orbit-mobile/src/lib/rosary/rosaryLogic';
import type { RosaryState } from '../../../orbit-mobile/src/hooks/useRosary';

function isRosaryRequest(text: string): boolean {
  return text.toLowerCase().includes('rezar o terço');
}

const BASE: RosaryState = {
  active: true,
  mysterySet: 'sorrowful',
  currentMysteryIndex: 0,
  step: 'cross',
  hailMaryCount: 0,
  intention: '',
};

const INTRO: RosaryState = { ...BASE, step: 'intro' };

describe('matchPrayerText', () => {
  it('aceita ave maria com typos leves', () => {
    expect(matchPrayerText('ave maria cheia de graca', 'mystery_hail_mary')).toBe(true);
  });

  it('aceita pai nosso', () => {
    expect(matchPrayerText('Pai nosso que estais nos ceus', 'our_father_opening')).toBe(true);
  });
});

describe('classifyRosaryIntentLocal', () => {
  it('detecta início de terço', () => {
    expect(
      classifyRosaryIntentLocal('vamos rezar o terço', { ...BASE, active: false }, isRosaryRequest).kind,
    ).toBe('start_rosary');
  });

  it('detecta parar', () => {
    expect(classifyRosaryIntentLocal('quero parar', BASE, isRosaryRequest).kind).toBe('stop_rosary');
  });

  it('detecta kickoff na introdução', () => {
    expect(classifyRosaryIntentLocal('vamos', INTRO, isRosaryRequest).kind).toBe('kickoff');
  });

  it('trata intenção natural na introdução', () => {
    expect(classifyRosaryIntentLocal('pela saúde da minha mãe', INTRO, isRosaryRequest).kind).toBe(
      'intention',
    );
    expect(classifyRosaryIntentLocal('meu avô no hospital', INTRO, isRosaryRequest).kind).toBe(
      'intention',
    );
  });

  it('ignora cumprimento na introdução', () => {
    expect(classifyRosaryIntentLocal('oi', INTRO, isRosaryRequest).kind).toBe('chat');
  });

  it('detecta oração na introdução', () => {
    expect(
      classifyRosaryIntentLocal('Em nome do Pai, e do Filho, e do Espírito Santo', INTRO, isRosaryRequest)
        .kind,
    ).toBe('prayer');
  });
});

describe('advanceRosaryState', () => {
  it('percorre abertura até primeiro mistério', () => {
    let s = BASE;
    s = advanceRosaryState(s);
    expect(s.step).toBe('creed');
    s = advanceRosaryState(s);
    expect(s.step).toBe('our_father_opening');
    s = advanceRosaryState(s);
    expect(s.step).toBe('hail_mary_3');
    expect(s.hailMaryCount).toBe(1);
  });

  it('conta dez ave-marias por mistério', () => {
    let s: RosaryState = {
      ...BASE,
      step: 'mystery_hail_mary',
      hailMaryCount: 1,
    };
    for (let i = 0; i < 9; i += 1) {
      s = advanceRosaryState(s);
      expect(s.step).toBe('mystery_hail_mary');
    }
    s = advanceRosaryState(s);
    expect(s.step).toBe('mystery_glory');
  });
});

describe('computeBeadProgress', () => {
  it('avança contas na abertura', () => {
    expect(computeBeadProgress(BASE).current).toBe(1);
    expect(computeBeadProgress({ ...BASE, step: 'hail_mary_3', hailMaryCount: 2 }).current).toBe(5);
  });

  it('avança contas nas ave-marias do mistério', () => {
    const first: RosaryState = {
      ...BASE,
      step: 'mystery_hail_mary',
      hailMaryCount: 1,
      currentMysteryIndex: 0,
    };
    expect(computeBeadProgress(first).current).toBe(9);
    const second = advanceRosaryState(first);
    expect(computeBeadProgress(second).current).toBe(10);
  });
});

describe('matchPrayerText modo junto', () => {
  it('aceita eco curto com amém na ave-maria', () => {
    expect(matchPrayerText('amém', 'mystery_hail_mary', 'together')).toBe(true);
    expect(matchPrayerText('ave maria', 'mystery_hail_mary', 'together')).toBe(true);
  });
});
