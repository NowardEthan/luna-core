import { describe, expect, it } from 'vitest';

import {
  mergeWeeklyTokenQuota,
  nextQuotaResetMs,
  readWeeklyTokens,
} from '../../../orbit-mobile/src/features/billing/quotaMerge';
import {
  WEEKLY_QUOTA_WINDOW_MS,
  WEEKLY_TOKEN_LIMITS,
  WINDOW_TOKEN_LIMITS,
} from '../../../orbit-mobile/src/features/billing/planQuotas';

describe('mergeWeeklyTokenQuota', () => {
  const weekStart = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const windowResetsAt = Date.now() + 2 * 60 * 60 * 1000;
  const freeWeekly = WEEKLY_TOKEN_LIMITS.free;
  const freeWindow = WINDOW_TOKEN_LIMITS.free;

  it('remaining é o mínimo entre janela e semana', () => {
    const result = mergeWeeklyTokenQuota('free', 20_000, windowResetsAt, 140_000, weekStart, 0);
    expect(result.remaining).toBe(freeWeekly - 140_000);
    expect(result.bindingCycle).toBe('weekly');
  });

  it('janela cheia bloqueia mesmo com semana livre', () => {
    const result = mergeWeeklyTokenQuota('free', 0, windowResetsAt, 10_000, weekStart, 0);
    expect(result.remaining).toBe(0);
    expect(result.bindingCycle).toBe('window');
  });

  it('semana cheia bloqueia mesmo com janela renovada', () => {
    const result = mergeWeeklyTokenQuota('free', freeWindow, windowResetsAt, freeWeekly, weekStart, 0);
    expect(result.remaining).toBe(0);
    expect(result.bindingCycle).toBe('weekly');
  });

  it('pending semanal entra no merge', () => {
    const result = mergeWeeklyTokenQuota(
      'free',
      freeWindow,
      windowResetsAt,
      freeWeekly - 5_000,
      weekStart,
      5_000,
    );
    expect(result.remaining).toBe(0);
    expect(result.weeklyTokens?.used).toBe(freeWeekly);
  });

  it('ambos com margem — janela é mais apertada', () => {
    const result = mergeWeeklyTokenQuota('plus', 5_000, windowResetsAt, 50_000, weekStart, 0);
    expect(result.remaining).toBe(5_000);
    expect(result.bindingCycle).toBe('window');
  });

  it('planos sem janela rolante não aplicam semanal', () => {
    const result = mergeWeeklyTokenQuota('byok', 100_000, windowResetsAt, 50_000, weekStart, 0);
    expect(result.weeklyTokens).toBeNull();
    expect(result.remaining).toBe(100_000);
  });
});

describe('readWeeklyTokens', () => {
  it('reinicia após 7 dias', () => {
    const now = Date.now();
    const oldStart = now - WEEKLY_QUOTA_WINDOW_MS - 1;
    const result = readWeeklyTokens({ tokens: 40_000, weekStart: oldStart }, now);
    expect(result.used).toBe(0);
  });

  it('lê uso dentro da janela semanal', () => {
    const now = Date.now();
    const weekStart = now - 24 * 60 * 60 * 1000;
    const result = readWeeklyTokens({ tokens: 42_000, weekStart }, now);
    expect(result.used).toBe(42_000);
  });

  it('migra contadores legados de mensagens', () => {
    const now = Date.now();
    const weekStart = now - 24 * 60 * 60 * 1000;
    const result = readWeeklyTokens({ messages: 10, weekStart }, now);
    expect(result.used).toBe(125_000);
  });
});

describe('nextQuotaResetMs', () => {
  it('devolve o mais próximo entre janela e semana', () => {
    const now = Date.now();
    const windowReset = now + 60 * 60 * 1000;
    const weeklyReset = now + 3 * 60 * 60 * 1000;
    expect(nextQuotaResetMs(windowReset, weeklyReset, now)).toBe(windowReset);
  });
});
