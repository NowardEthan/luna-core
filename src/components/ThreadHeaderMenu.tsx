import React, { memo, useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useMotionProfile } from '../hooks/useMotionProfile';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

export type ThreadMenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: ThreadMenuItem[];
  /** Distância do topo (px) onde o menu ancora — logo abaixo do botão ⋮. */
  topOffset: number;
};

/** Menu de contexto da conversa, ancorado no canto superior direito (abaixo do ⋮). */
export const ThreadHeaderMenu = memo(function ThreadHeaderMenu({
  visible,
  onClose,
  items,
  topOffset,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const menuY = useRef(new Animated.Value(-8)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      menuY.setValue(-8);
      menuOpacity.setValue(0);
      return;
    }
    if (!interactions || reduceMotion) {
      backdrop.setValue(1);
      menuY.setValue(0);
      menuOpacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(menuY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
      Animated.timing(menuOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, menuOpacity, menuY, reduceMotion, visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.menu,
          { top: topOffset, opacity: menuOpacity, transform: [{ translateY: menuY }] },
        ]}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.key}
            onPress={() => {
              if (item.disabled) return;
              onClose();
              item.onPress();
            }}
            disabled={item.disabled}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowDivider,
              pressed && styles.rowPressed,
              item.disabled && styles.rowDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Ionicons
              name={item.icon}
              size={19}
              color={item.destructive ? tokens.error : tokens.accentBright}
            />
            <Text style={[styles.label, item.destructive && styles.labelDestructive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 6, 12, 0.4)',
  },
  menu: {
    position: 'absolute',
    right: 12,
    minWidth: 220,
    borderRadius: 14,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  rowDisabled: { opacity: 0.45 },
  label: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  labelDestructive: { color: tokens.error },
});
