import React, { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../theme/tokens';

type Props = {
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** Ícone flor — toggle do modo terço no composer. */
export const RosaryTool = memo(function RosaryTool({ active, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      accessibilityLabel={active ? 'Parar terço' : 'Rezar terço'}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <Ionicons
        name={active ? 'flower' : 'flower-outline'}
        size={24}
        color={active ? tokens.accentBright : tokens.accentSoft}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
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
});
