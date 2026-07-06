import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './Glass';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';
import {
  formatRosaryProgress,
  type RosaryMysterySet,
  type RosaryState,
} from '../hooks/useRosary';

type Props = {
  state: RosaryState;
  onToggle: () => void;
  onAdvance: () => void;
  onStop: () => void;
  onSelectSet: (set: RosaryMysterySet) => void;
  onRequestReflection?: () => void;
};

const SETS: { key: RosaryMysterySet; label: string; color: string }[] = [
  { key: 'joyful', label: 'Gozosos', color: '#FFD54F' },
  { key: 'sorrowful', label: 'Dolorosos', color: '#90A4AE' },
  { key: 'glorious', label: 'Gloriosos', color: '#FF8A65' },
  { key: 'luminous', label: 'Luminosos', color: '#4FC3F7' },
];

export const RosaryTool = memo(function RosaryTool({
  state,
  onToggle,
  onAdvance,
  onStop,
  onSelectSet,
  onRequestReflection,
}: Props) {
  if (!state.active) {
    return (
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityLabel="Rezar terço"
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      >
        <Ionicons name="flower-outline" size={24} color={tokens.accentSoft} />
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Glass radius={18} intensity={24} strong style={styles.panel}>
        <View style={styles.header}>
          <Ionicons name="flower" size={18} color={tokens.accentSoft} />
          <Text style={[type.caption, styles.title]}>Terço</Text>
          <Text style={[type.caption, styles.progress]}>{formatRosaryProgress(state)}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.setRow}
          style={styles.setScroll}
        >
          {SETS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => onSelectSet(s.key)}
              style={[
                styles.setChip,
                state.mysterySet === s.key && { borderColor: s.color },
              ]}
            >
              <View style={[styles.setDot, { backgroundColor: s.color }]} />
              <Text style={[type.caption, styles.setLabel]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable onPress={onStop} style={styles.actionBtn}>
            <Text style={[type.caption, styles.actionLabel]}>Sair</Text>
          </Pressable>
          <Pressable onPress={onAdvance} style={styles.actionBtn}>
            <Text style={[type.caption, styles.actionLabel]}>Avançar</Text>
          </Pressable>
          {onRequestReflection ? (
            <Pressable onPress={onRequestReflection} style={styles.actionBtn}>
              <Text style={[type.caption, styles.actionLabel]}>Reflexão</Text>
            </Pressable>
          ) : null}
        </View>
      </Glass>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconBtnPressed: {
    opacity: 0.65,
  },
  panel: {
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: tokens.textHigh,
    fontWeight: '600',
  },
  progress: {
    color: tokens.textMid,
    marginLeft: 'auto',
  },
  setScroll: {
    flexGrow: 0,
  },
  setRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingRight: 12,
  },
  setChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.glassBorder,
  },
  setDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  setLabel: {
    color: tokens.textMid,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
  },
  actionLabel: {
    color: tokens.textHigh,
    fontWeight: '500',
  },
});
