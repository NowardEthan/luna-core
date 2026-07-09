import React, { memo, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRosaryJournal } from '../hooks/useRosaryJournal';
import type { RosaryDayDoc } from '../lib/rosary/rosaryJournalTypes';
import {
  buildCalendarCells,
  localDateKey,
  MONTH_LABELS_PT,
  monthKey,
  WEEKDAY_LABELS_PT,
} from '../lib/rosary/rosaryJournalUtils';
import { hapticListTap } from '../lib/haptics';
import { tokens } from '../theme/tokens';

type Props = {
  visible: boolean;
  uid: string | null;
  onClose: () => void;
};

function dayStatus(day: RosaryDayDoc | undefined): 'none' | 'touched' | 'completed' {
  if (!day?.touched) return 'none';
  if (day.completed) return 'completed';
  return 'touched';
}

export const RosaryCalendarSheet = memo(function RosaryCalendarSheet({
  visible,
  uid,
  onClose,
}: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { days, loading, stats } = useRosaryJournal({ uid, year, month });

  const grid = useMemo(() => buildCalendarCells(year, month), [year, month]);
  const todayKey = localDateKey(now);
  const selectedDay = selectedKey ? days[selectedKey] : undefined;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedKey(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

          <Text style={styles.title}>Calendário de terços</Text>
          <Text style={styles.subtitle}>
            Aqui ficam os dias em que caminhaste comigo no terço.
          </Text>

          <View style={styles.monthHeader}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityLabel="Mês anterior">
              <Ionicons name="chevron-back" size={22} color={tokens.textMid} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_LABELS_PT[month - 1]} {year}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityLabel="Mês seguinte">
              <Ionicons name="chevron-forward" size={22} color={tokens.textMid} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS_PT.map((label) => (
              <Text key={label} style={styles.weekLabel}>
                {label}
              </Text>
            ))}
          </View>

          <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
            {grid.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.weekRow}>
                {row.map((dayNum, ci) => {
                  if (dayNum == null) {
                    return <View key={`e-${ri}-${ci}`} style={styles.dayCell} />;
                  }
                  const dateKey = `${monthKey(year, month)}-${String(dayNum).padStart(2, '0')}`;
                  const status = dayStatus(days[dateKey]);
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedKey;

                  return (
                    <Pressable
                      key={dateKey}
                      onPress={() => {
                        hapticListTap();
                        setSelectedKey(dateKey);
                      }}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayToday,
                        isSelected && styles.daySelected,
                      ]}
                      accessibilityLabel={`Dia ${dayNum}`}
                    >
                      <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{dayNum}</Text>
                      {status === 'touched' ? <View style={styles.dotTouched} /> : null}
                      {status === 'completed' ? (
                        <Ionicons name="flower" size={10} color={tokens.accentBright} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.dotTouched} />
              <Text style={styles.legendText}>Terço iniciado</Text>
            </View>
            <View style={styles.legendItem}>
              <Ionicons name="flower" size={12} color={tokens.accentBright} />
              <Text style={styles.legendText}>Terço concluído</Text>
            </View>
          </View>

          <Text style={styles.stats}>
            {loading
              ? 'A carregar…'
              : `${stats.touchedDays} dias com terço · ${stats.completedDays} concluídos`}
          </Text>

          {selectedDay ? (
            <Text style={styles.detail}>
              {selectedDay.completed
                ? 'Terço concluído neste dia.'
                : selectedDay.touched
                  ? `Terço iniciado${selectedDay.sessionCount > 1 ? ` (${selectedDay.sessionCount}×)` : ''}.`
                  : 'Sem registo de terço neste dia.'}
            </Text>
          ) : null}

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Fechar</Text>
          </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const CELL_WIDTH = '14.28%';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 12, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetWrap: { width: '100%' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 10,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 12,
  },
  title: {
    color: tokens.textHigh,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthLabel: {
    color: tokens.textHigh,
    fontSize: 16,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekLabel: {
    width: CELL_WIDTH,
    textAlign: 'center',
    color: tokens.textLow,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  gridScroll: {
    maxHeight: 280,
  },
  dayCell: {
    width: CELL_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 2,
  },
  dayToday: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.accentBright,
  },
  daySelected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dayNum: {
    color: tokens.textMid,
    fontSize: 14,
    fontWeight: '500',
  },
  dayNumToday: {
    color: tokens.textHigh,
    fontWeight: '700',
  },
  dotTouched: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(140, 120, 200, 0.85)',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    color: tokens.textMid,
    fontSize: 12,
  },
  stats: {
    color: tokens.textMid,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  detail: {
    color: tokens.textHigh,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  closeBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeBtnText: {
    color: tokens.accentBright,
    fontSize: 15,
    fontWeight: '600',
  },
});
