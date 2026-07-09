import React, { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MYSTERY_SET_LABELS } from '../lib/rosary/rosaryTexts';
import type { RosaryMysterySet } from '../hooks/useRosary';
import { hapticListTap } from '../lib/haptics';
import { tokens } from '../theme/tokens';

const SETS: RosaryMysterySet[] = ['joyful', 'sorrowful', 'glorious', 'luminous'];

type Props = {
  visible: boolean;
  onSelect: (set: RosaryMysterySet) => void;
  onCancel: () => void;
};

export const RosarySetSheet = memo(function RosarySetSheet({ visible, onSelect, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.wrap} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Conjunto de mistérios</Text>
            {SETS.map((set) => (
              <Pressable
                key={set}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => {
                  hapticListTap();
                  onSelect(set);
                }}
              >
                <Text style={styles.rowLabel}>{MYSTERY_SET_LABELS[set]}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 12, 0.78)',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 24,
  },
  wrap: { width: '100%' },
  sheet: {
    borderRadius: 22,
    padding: 14,
    gap: 4,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  title: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
  },
  rowPressed: { opacity: 0.7 },
  rowLabel: {
    color: tokens.textMid,
    fontSize: 15,
    textAlign: 'center',
  },
});
