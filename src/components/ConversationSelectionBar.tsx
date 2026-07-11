import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  count: number;
  title: string;
  confirmingDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelConfirm: () => void;
}

/** Barra superior de ações quando conversas estão selecionadas. */
export function ConversationSelectionBar({
  visible,
  count,
  title,
  confirmingDelete,
  onClose,
  onDelete,
  onConfirmDelete,
  onCancelConfirm,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const translateY = useRef(new Animated.Value(-72)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = visible && interactions && !reduceMotion;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: show ? 0 : -72,
        ...springs.tab,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: show ? 1 : 0,
        duration: show ? 200 : 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [interactions, opacity, reduceMotion, translateY, visible]);

  if (!visible) return null;

  const countLabel = count === 1 ? '1 selecionada' : `${count} selecionadas`;
  const confirmText =
    count <= 1
      ? `Apagar "${title}"? Vai para a lixeira — você pode restaurar depois.`
      : `Apagar ${count} conversas? Vão para a lixeira — você pode restaurar depois.`;

  return (
    <Animated.View
      style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {confirmingDelete ? (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText} numberOfLines={3}>
            {confirmText}
          </Text>
          <View style={styles.confirmRow}>
            <Pressable
              onPress={onCancelConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmCancel, pressed && styles.pressed]}
            >
              <Text style={styles.confirmCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onConfirmDelete}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmDanger, pressed && styles.pressed]}
            >
              <Ionicons name="trash" size={16} color="#fff" />
              <Text style={styles.confirmDangerText}>Apagar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityLabel="Cancelar seleção"
          >
            <Ionicons name="close" size={22} color={tokens.textHigh} />
          </Pressable>
          <View style={styles.titleCol}>
            <Text style={styles.kicker}>{countLabel}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Pressable
            onPress={onDelete}
            disabled={count === 0}
            hitSlop={10}
            style={({ pressed }) => [
              styles.deleteBtn,
              count === 0 && styles.deleteBtnDisabled,
              pressed && count > 0 && styles.pressed,
            ]}
            accessibilityLabel="Apagar conversas selecionadas"
          >
            <Ionicons name="trash-outline" size={20} color="#F87171" />
            <Text style={styles.deleteLabel}>Apagar</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

interface TrashBarProps {
  visible: boolean;
  count: number;
  title: string;
  pendingAction: 'restore' | 'permanent' | null;
  onClose: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}

/** Barra de ações para itens na lixeira (multi-seleção). */
export function TrashSelectionBar({
  visible,
  count,
  title,
  pendingAction,
  onClose,
  onRestore,
  onPermanentDelete,
  onConfirm,
  onCancelConfirm,
}: TrashBarProps) {
  const { interactions, reduceMotion } = useMotionProfile();
  const translateY = useRef(new Animated.Value(-72)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = visible && interactions && !reduceMotion;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: show ? 0 : -72,
        ...springs.tab,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: show ? 1 : 0,
        duration: show ? 200 : 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [interactions, opacity, reduceMotion, translateY, visible]);

  if (!visible) return null;

  const countLabel = count === 1 ? '1 na lixeira' : `${count} na lixeira`;
  const confirmCopy =
    pendingAction === 'restore'
      ? count <= 1
        ? `Restaurar "${title}" na lista de conversas?`
        : `Restaurar ${count} conversas na lista?`
      : count <= 1
        ? `Apagar "${title}" para sempre? Não dá para desfazer.`
        : `Apagar ${count} conversas para sempre? Não dá para desfazer.`;

  return (
    <Animated.View
      style={[styles.wrap, styles.trashWrap, { opacity, transform: [{ translateY }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {pendingAction ? (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>{confirmCopy}</Text>
          <View style={styles.confirmRow}>
            <Pressable
              onPress={onCancelConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmCancel, pressed && styles.pressed]}
            >
              <Text style={styles.confirmCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.confirmBtn,
                pendingAction === 'restore' ? styles.confirmRestore : styles.confirmDanger,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={pendingAction === 'restore' ? 'arrow-undo' : 'trash'}
                size={16}
                color="#fff"
              />
              <Text style={styles.confirmDangerText}>
                {pendingAction === 'restore' ? 'Restaurar' : 'Apagar'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={tokens.textHigh} />
          </Pressable>
          <View style={styles.titleCol}>
            <Text style={styles.kicker}>{countLabel}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Pressable
            onPress={onRestore}
            disabled={count === 0}
            hitSlop={8}
            style={({ pressed }) => [
              styles.trashActionBtn,
              count === 0 && styles.actionDisabled,
              pressed && count > 0 && styles.pressed,
            ]}
          >
            <Ionicons name="arrow-undo-outline" size={20} color={tokens.accentText} />
          </Pressable>
          <Pressable
            onPress={onPermanentDelete}
            disabled={count === 0}
            hitSlop={8}
            style={({ pressed }) => [
              styles.trashActionBtn,
              count === 0 && styles.actionDisabled,
              pressed && count > 0 && styles.pressed,
            ]}
          >
            <Ionicons name="trash-outline" size={20} color="#F87171" />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(22, 24, 31, 0.96)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    overflow: 'hidden',
  },
  trashWrap: {
    borderColor: 'rgba(248,113,113,0.18)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, gap: 1 },
  kicker: {
    color: tokens.accentText,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  deleteLabel: { color: tokens.error, fontSize: 14, fontWeight: '600' },
  deleteBtnDisabled: { opacity: 0.4 },
  actionDisabled: { opacity: 0.4 },
  trashActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  confirmBlock: { padding: 14, gap: 12 },
  confirmText: { color: tokens.textMid, fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  confirmCancel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  confirmCancelText: { color: tokens.textMid, fontSize: 14, fontWeight: '600' },
  confirmDanger: { backgroundColor: 'rgba(248,113,113,0.85)' },
  confirmRestore: { backgroundColor: tokens.accent },
  confirmDangerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
