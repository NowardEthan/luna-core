import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticDestructive, hapticListTap } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

export type OrganizeSheetAction = 'rename' | 'move' | 'pin' | 'unpin' | 'select' | 'delete';

interface Props {
  visible: boolean;
  title: string;
  pinned?: boolean;
  onClose: () => void;
  onAction: (action: OrganizeSheetAction) => void;
}

function ActionRow({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconWrap, destructive && styles.iconWrapDanger]}>
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? tokens.error : tokens.accentBright}
        />
      </View>
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

export function ConversationOrganizeSheet({
  visible,
  title,
  pinned,
  onClose,
  onAction,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(280)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(280);
      return;
    }
    if (!interactions || reduceMotion) {
      backdrop.setValue(1);
      sheetY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, reduceMotion, sheetY, visible]);

  const handleClose = () => {
    if (!interactions || reduceMotion) {
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 280, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
          <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <ActionRow
            icon="pencil-outline"
            label={ORGANIZE_COPY.rename}
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction('rename');
            }}
          />
          <ActionRow
            icon="folder-open-outline"
            label={ORGANIZE_COPY.moveTo}
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction('move');
            }}
          />
          <ActionRow
            icon={pinned ? 'pin' : 'pin-outline'}
            label={pinned ? ORGANIZE_COPY.unpin : ORGANIZE_COPY.pin}
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction(pinned ? 'unpin' : 'pin');
            }}
          />
          <ActionRow
            icon="checkbox-outline"
            label={ORGANIZE_COPY.select}
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction('select');
            }}
          />
          <ActionRow
            icon="trash-outline"
            label={ORGANIZE_COPY.delete}
            destructive
            onPress={() => {
              hapticDestructive();
              handleClose();
              onAction('delete');
            }}
          />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
    backgroundColor: '#1A1E28',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 14,
  },
  title: {
    color: tokens.textHigh,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowPressed: { opacity: 0.85 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
  },
  iconWrapDanger: { backgroundColor: 'rgba(248,113,113,0.14)' },
  rowLabel: { color: tokens.textHigh, fontSize: 16, fontWeight: '500' },
  rowLabelDanger: { color: tokens.error },
});
