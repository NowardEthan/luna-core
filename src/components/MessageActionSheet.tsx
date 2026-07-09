import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ChatMessage } from '../data/fixtures';
import {
  type MessageSheetAction,
  type MessageSheetActionItem,
  sheetActionItemsForMessage,
} from '../lib/messageActions';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticListTap } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { MessageActionPreview } from './MessageActionPreview';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  visible: boolean;
  message: ChatMessage | null;
  messages: ChatMessage[];
  onClose: () => void;
  onAction: (action: MessageSheetAction, message: ChatMessage) => void;
}

function ActionRow({
  item,
  accent,
  onPress,
}: {
  item: MessageSheetActionItem;
  accent: 'user' | 'luna';
  onPress: () => void;
}) {
  const iconBg = accent === 'user' ? 'rgba(94, 134, 245, 0.18)' : tokens.accentSoft;
  const iconColor = accent === 'user' ? tokens.bubbleUserStart : tokens.accentBright;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityLabel={item.label}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={item.icon} size={20} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        <Text style={styles.rowSub}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.textMid} />
    </Pressable>
  );
}

export function MessageActionSheet({ visible, message, messages, onClose, onAction }: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(280)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(280);
      sheetOpacity.setValue(0);
      return;
    }

    if (!interactions || reduceMotion) {
      backdrop.setValue(1);
      sheetY.setValue(0);
      sheetOpacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, reduceMotion, sheetOpacity, sheetY, visible]);

  const handleClose = () => {
    if (!interactions || reduceMotion) {
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 280, duration: 200, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const actionGroups = useMemo(() => {
    if (!message) return { main: [] as MessageSheetActionItem[], branch: [] as MessageSheetActionItem[] };
    const items = sheetActionItemsForMessage(message, messages);
    return {
      main: items.filter((i) => i.group !== 'branch'),
      branch: items.filter((i) => i.group === 'branch'),
    };
  }, [message, messages]);

  if (!message) return null;

  const isUser = message.role === 'user';
  const accent = isUser ? 'user' : 'luna';
  const sectionLabel = isUser ? 'Sua mensagem' : 'Resposta da Luna';

  const runAction = (action: MessageSheetAction) => {
    hapticListTap();
    onAction(action, message);
    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Fechar">
          <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetWrap,
            { transform: [{ translateY: sheetY }], opacity: sheetOpacity },
          ]}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sectionTitle}>{sectionLabel}</Text>
            <MessageActionPreview message={message} />

            {actionGroups.main.length > 0 ? (
              <View style={styles.actionBlock}>
                <Text style={styles.actionBlockLabel}>Ações</Text>
                <View style={styles.actions}>
                  {actionGroups.main.map((item) => (
                    <ActionRow
                      key={item.id}
                      item={item}
                      accent={accent}
                      onPress={() => runAction(item.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {actionGroups.branch.length > 0 ? (
              <View style={styles.actionBlock}>
                <Text style={styles.actionBlockLabel}>Ramo alternativo</Text>
                <View style={styles.actions}>
                  {actionGroups.branch.map((item) => (
                    <ActionRow
                      key={item.id}
                      item={item}
                      accent={accent}
                      onPress={() => runAction(item.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {actionGroups.main.length === 0 && actionGroups.branch.length === 0 ? (
              <Text style={styles.emptyActions}>Nenhuma ação disponível para esta mensagem.</Text>
            ) : null}

            <Pressable onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 6, 12, 0.78)' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: 24 },
  sheet: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  sectionTitle: {
    color: tokens.textMid,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  actionBlock: { marginTop: 4, marginBottom: 4 },
  actionBlockLabel: {
    color: tokens.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 4,
  },
  actions: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: tokens.surface,
  },
  rowPressed: { backgroundColor: tokens.surfaceHover },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  rowSub: { color: tokens.textMid, fontSize: 12, lineHeight: 17, marginTop: 2 },
  emptyActions: {
    color: tokens.textMid,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelText: {
    ...type.message,
    color: tokens.textMid,
    fontWeight: '500',
  },
});
