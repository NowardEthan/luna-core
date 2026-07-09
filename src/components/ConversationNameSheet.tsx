import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticConfirm } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}

export function ConversationNameSheet({
  visible,
  title,
  initialValue,
  placeholder,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const { interactions, reduceMotion } = useMotionProfile();
  const keyboardHeight = useKeyboardHeight();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [initialValue, visible]);

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(320);
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
    Keyboard.dismiss();
    if (!interactions || reduceMotion) {
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 320, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    hapticConfirm();
    onSave(trimmed);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={{ transform: [{ translateY: sheetY }], marginBottom: keyboardHeight }}
        >
          <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={tokens.textLow}
            style={styles.input}
            maxLength={80}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={styles.actions}>
            <Pressable onPress={handleClose} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>{ORGANIZE_COPY.cancel}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!value.trim() || saving}
              style={[styles.btnPrimary, (!value.trim() || saving) && styles.btnDisabled]}
            >
              <Ionicons name="checkmark" size={18} color={tokens.onAccent} />
              <Text style={styles.btnPrimaryText}>{ORGANIZE_COPY.save}</Text>
            </Pressable>
          </View>
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
    paddingBottom: 24,
    paddingTop: 16,
    gap: 14,
    backgroundColor: '#1A1E28',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  title: { color: tokens.textHigh, fontSize: 17, fontWeight: '700' },
  input: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: tokens.textHigh,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 10 },
  btnGhostText: { color: tokens.textMid, fontSize: 15, fontWeight: '600' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: tokens.onAccent, fontSize: 15, fontWeight: '700' },
});
