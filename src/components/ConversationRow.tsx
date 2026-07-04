import React, { memo, useLayoutEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './Glass';
import { LunaAvatar } from './LunaAvatar';
import { SessionItem } from '../data/fixtures';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticListTap, hapticLongPress } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

interface Props {
  session: SessionItem;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
}

export const ConversationRow = memo(function ConversationRow({
  session,
  selected = false,
  selectionMode = false,
  onPress,
  onPressIn,
  onLongPress,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const selectAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    if (!interactions || reduceMotion) {
      selectAnim.setValue(selected ? 1 : 0);
      scaleAnim.setValue(selected ? 0.985 : 1);
      return;
    }
    Animated.parallel([
      Animated.spring(selectAnim, {
        toValue: selected ? 1 : 0,
        ...springs.press,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: selected ? 0.985 : 1,
        ...springs.press,
        useNativeDriver: true,
      }),
    ]).start();
  }, [interactions, reduceMotion, scaleAnim, selectAnim, selected]);

  const handlePressIn = () => {
    if (!selectionMode) hapticListTap();
    onPressIn?.();
  };

  const handleLongPress = () => {
    hapticLongPress();
    onLongPress?.();
  };

  const borderColor = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.glassBorder, tokens.accent],
  });

  const bgTint = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.055)', 'rgba(75,117,242,0.22)'],
  });

  const dimOpacity = selectionMode && !selected ? 0.52 : 1;

  return (
    <Animated.View style={{ opacity: dimOpacity, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={420}
        android_ripple={{ color: 'rgba(75,117,242,0.14)' }}
        style={({ pressed }) => [pressed && !selectionMode && styles.pressed]}
      >
        <Animated.View
          style={[
            styles.shell,
            {
              borderColor,
              backgroundColor: bgTint,
            },
          ]}
        >
          <View style={[styles.checkSlot, selected && styles.checkSlotVisible]}>
            {selected ? (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={tokens.onAccent} />
              </View>
            ) : (
              <View style={styles.checkPlaceholder} />
            )}
          </View>
          <LunaAvatar size={36} />
          <View style={styles.col}>
            <Text style={[styles.title, selected && styles.titleSelected]} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.preview} numberOfLines={1}>
              {session.preview}
            </Text>
          </View>
          {!selectionMode ? (
            <Text style={styles.time}>{session.updatedAt}</Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/** Variante visual para itens na lixeira (sem avatar Luna). */
export const TrashConversationRow = memo(function TrashConversationRow({
  session,
  selected = false,
  selectionMode = false,
  onPress,
  onLongPress,
  meta,
}: {
  session: SessionItem;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  meta: string;
}) {
  const { interactions, reduceMotion } = useMotionProfile();
  const selectAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useLayoutEffect(() => {
    if (!interactions || reduceMotion) {
      selectAnim.setValue(selected ? 1 : 0);
      return;
    }
    Animated.spring(selectAnim, {
      toValue: selected ? 1 : 0,
      ...springs.press,
      useNativeDriver: false,
    }).start();
  }, [interactions, reduceMotion, selectAnim, selected]);

  const borderColor = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.glassBorder, '#F87171'],
  });

  const bgTint = selectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.055)', 'rgba(248,113,113,0.14)'],
  });

  const dimOpacity = selectionMode && !selected ? 0.52 : 1;

  return (
    <Animated.View style={{ opacity: dimOpacity }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress ? () => { hapticLongPress(); onLongPress(); } : undefined}
        delayLongPress={420}
      >
        <Animated.View style={[styles.shell, { borderColor, backgroundColor: bgTint }]}>
          <View style={[styles.checkSlot, selected && styles.checkSlotVisible]}>
            {selected ? (
              <View style={[styles.checkCircle, styles.checkCircleTrash]}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            ) : (
              <View style={styles.checkPlaceholder} />
            )}
          </View>
          <View style={styles.trashIcon}>
            <Ionicons name="trash-outline" size={18} color={tokens.textLow} />
          </View>
          <View style={styles.col}>
            <Text style={styles.title} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.preview} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  checkSlot: {
    width: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSlotVisible: {
    width: 28,
    marginRight: 4,
  },
  checkPlaceholder: { width: 22, height: 22 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleTrash: {
    backgroundColor: '#E57373',
  },
  trashIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  col: { flex: 1, paddingHorizontal: 11, gap: 2 },
  title: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  titleSelected: { color: tokens.accentBright },
  preview: { color: tokens.textMid, fontSize: 13 },
  time: { color: tokens.textLow, fontSize: 11, fontWeight: '500' },
  pressed: { opacity: 0.9 },
});
