import React, { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MYSTERY_SET_LABELS } from '../lib/rosary/rosaryTexts';
import type { PrayerMode, RosaryMysterySet } from '../hooks/useRosary';
import { hapticListTap } from '../lib/haptics';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

type Props = {
  visible: boolean;
  mysterySet: RosaryMysterySet;
  onSelect: (mode: PrayerMode) => void;
  onCancel: () => void;
};

export const RosaryModeSheet = memo(function RosaryModeSheet({
  visible,
  mysterySet,
  onSelect,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Ionicons name="flower" size={22} color={tokens.accentSoft} />
              <Text style={styles.title}>Como você quer rezar?</Text>
              <Text style={styles.sub}>
                Mistérios {MYSTERY_SET_LABELS[mysterySet].toLowerCase()} · escolha uma vez por sessão
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => {
                hapticListTap();
                onSelect('together');
              }}
            >
              <Ionicons name="people-outline" size={22} color={tokens.accentBright} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Junto</Text>
                <Text style={styles.optionDetail}>A Luna reza na bolha; você ecoa escrevendo.</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => {
                hapticListTap();
                onSelect('solo');
              }}
            >
              <Ionicons name="person-outline" size={22} color={tokens.accentSoft} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Sozinho</Text>
                <Text style={styles.optionDetail}>A Luna guia com frases curtas; você reza tudo.</Text>
              </View>
            </Pressable>

            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Agora não</Text>
            </Pressable>
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
    paddingBottom: 28,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    ...type.headerTitle,
    fontSize: 18,
    color: tokens.textHigh,
  },
  sub: {
    ...type.caption,
    color: tokens.textMid,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
  },
  optionPressed: {
    opacity: 0.75,
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
  },
  optionDetail: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 18,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    color: tokens.textLow,
    fontSize: 14,
  },
});
