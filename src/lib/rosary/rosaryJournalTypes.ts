import type { RosaryMysterySet } from '../../hooks/useRosary';

export type RosaryDayDoc = {
  dateKey: string;
  touched: boolean;
  completed: boolean;
  sessionCount: number;
  lastMysterySet?: RosaryMysterySet;
  updatedAt?: number;
};

export type RosaryMonthMap = Record<string, RosaryDayDoc>;
