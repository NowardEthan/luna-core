import { describe, expect, it } from 'vitest';

import {
  buildCalendarCells,
  localDateKey,
  monthDateRange,
  monthKey,
  parseDateKey,
} from '../../../orbit-mobile/src/lib/rosary/rosaryJournalUtils';

describe('localDateKey', () => {
  it('formata YYYY-MM-DD no fuso local', () => {
    const date = new Date(2026, 6, 5, 23, 59);
    expect(localDateKey(date)).toBe('2026-07-05');
  });
});

describe('monthKey e monthDateRange', () => {
  it('monthKey preenche mês com zero', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
  });

  it('monthDateRange cobre o mês inteiro', () => {
    expect(monthDateRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthDateRange(2024, 2)).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });
});

describe('parseDateKey', () => {
  it('decompõe chave do dia', () => {
    expect(parseDateKey('2026-07-06')).toEqual({ year: 2026, month: 7, day: 6 });
  });
});

describe('buildCalendarCells', () => {
  it('julho 2026 começa numa quarta (células vazias à esquerda)', () => {
    const rows = buildCalendarCells(2026, 7);
    expect(rows[0]![0]).toBeNull();
    expect(rows[0]![1]).toBeNull();
    expect(rows[0]![2]).toBeNull();
    expect(rows[0]![3]).toBe(1);
    expect(rows.flat().filter((c) => c === 31)).toHaveLength(1);
  });

  it('cada linha tem 7 colunas', () => {
    const rows = buildCalendarCells(2026, 1);
    for (const row of rows) {
      expect(row).toHaveLength(7);
    }
  });
});
