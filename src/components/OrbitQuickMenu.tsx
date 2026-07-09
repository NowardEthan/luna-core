import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useMotionProfile } from '../hooks/useMotionProfile';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

export type OrbitQuickAction = 'new_chat' | 'rosary_calendar' | 'start_rosary';

type ActionItem = {
  id: OrbitQuickAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const ACTIONS: ActionItem[] = [
  { id: 'new_chat', label: 'Nova conversa', icon: 'chatbubble-ellipses-outline' },
  { id: 'rosary_calendar', label: 'Calendário de terços', icon: 'calendar-outline' },
  { id: 'start_rosary', label: 'Rezar terço', icon: 'flower-outline' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onAction: (action: OrbitQuickAction) => void;
  /** Posição Y do topo do FAB (para ancorar o menu). */
  anchorBottom?: number;
  fabRotation?: Animated.Value;
};

export const OrbitQuickMenu = memo(function OrbitQuickMenu({
  visible,
  onClose,
  onAction,
  anchorBottom = 88,
  fabRotation,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const menuY = useRef(new Animated.Value(24)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      menuY.setValue(24);
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
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(menuY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
      Animated.timing(menuOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, menuOpacity, menuY, reduceMotion, visible]);

  const handleAction = (id: OrbitQuickAction) => {
    onClose();
    onAction(id);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.menuWrap,
            { bottom: anchorBottom, opacity: menuOpacity, transform: [{ translateY: menuY }] },
          ]}
          pointerEvents="box-none"
        >
          {ACTIONS.map((action, index) => (
            <Pressable
              key={action.id}
              onPress={() => handleAction(action.id)}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.actionPressed,
                { marginBottom: index < ACTIONS.length - 1 ? 10 : 0 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={action.icon} size={20} color={tokens.accentBright} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </Animated.View>

        {fabRotation ? (
          <Animated.View
            style={[
              styles.fabMirror,
              {
                bottom: anchorBottom - 56,
                transform: [
                  {
                    rotate: fabRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '45deg'],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </Modal>
  );
});

type TabBarQuickMenuProps = {
  visible: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAction: (action: OrbitQuickAction) => void;
  fabBottom: number;
};

/** Menu rápido integrado à tab bar (sem modal duplicado do FAB). */
export const OrbitTabBarQuickOverlay = memo(function OrbitTabBarQuickOverlay({
  visible,
  onClose,
  onAction,
  fabBottom,
}: Omit<TabBarQuickMenuProps, 'onToggle'>) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const menuY = useRef(new Animated.Value(20)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      menuY.setValue(20);
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
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(menuY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
      Animated.timing(menuOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, menuOpacity, menuY, reduceMotion, visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.menuWrap,
          { bottom: fabBottom + 64, opacity: menuOpacity, transform: [{ translateY: menuY }] },
        ]}
      >
        {ACTIONS.map((action, index) => (
          <Pressable
            key={action.id}
            onPress={() => {
              onClose();
              onAction(action.id);
            }}
            style={({ pressed }) => [
              styles.actionRow,
              pressed && styles.actionPressed,
              { marginBottom: index < ACTIONS.length - 1 ? 10 : 0 },
            ]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name={action.icon} size={20} color={tokens.accentBright} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 6, 12, 0.72)',
  },
  menuWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.12)',
    minWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  actionPressed: { opacity: 0.85 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
  },
  actionLabel: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  fabMirror: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
  },
});

export function useFabRotation(open: boolean) {
  const rotation = useRef(new Animated.Value(0)).current;
  const { interactions, reduceMotion } = useMotionProfile();

  useEffect(() => {
    const toValue = open ? 1 : 0;
    if (!interactions || reduceMotion) {
      rotation.setValue(toValue);
      return;
    }
    Animated.spring(rotation, { toValue, ...springs.tab, useNativeDriver: true }).start();
  }, [interactions, open, reduceMotion, rotation]);

  return rotation;
}
