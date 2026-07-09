import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticConfirm, hapticDestructive } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { SettingsRow } from './settings/SettingsRow';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  displayName: string;
  bio: string;
  saving?: boolean;
  hasAvatar?: boolean;
  hasCover?: boolean;
  imageUploading?: 'avatar' | 'cover' | null;
  onClose: () => void;
  onSave: (patch: { displayName: string; bio: string }) => void;
  onChangeAvatar: () => void;
  onChangeCover: () => void;
  onRemoveAvatar?: () => void;
  onRemoveCover?: () => void;
}

export function ProfileEditSheet({
  visible,
  displayName,
  bio,
  saving = false,
  hasAvatar = false,
  hasCover = false,
  imageUploading = null,
  onClose,
  onSave,
  onChangeAvatar,
  onChangeCover,
  onRemoveAvatar,
  onRemoveCover,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const keyboardHeight = useKeyboardHeight();
  const { bottom: bottomInset } = useLayoutInsets();
  const sheetBottomPad = keyboardHeight > 0 ? keyboardHeight + 6 : Math.max(bottomInset, 24);

  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(320)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  const [nameDraft, setNameDraft] = useState(displayName);
  const [bioDraft, setBioDraft] = useState(bio);

  useEffect(() => {
    if (!visible) return;
    setNameDraft(displayName);
    setBioDraft(bio);
  }, [visible, displayName, bio]);

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(320);
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
      Animated.timing(sheetY, { toValue: 320, duration: 200, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleSave = () => {
    hapticConfirm();
    onSave({
      displayName: nameDraft.trim() || displayName,
      bio: bioDraft.trim(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Keyboard.dismiss();
            handleClose();
          }}
          accessibilityLabel="Fechar"
        >
          <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetWrap,
            { paddingBottom: sheetBottomPad, transform: [{ translateY: sheetY }], opacity: sheetOpacity },
          ]}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetScroll}
          >
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.title}>Editar perfil</Text>

              <Text style={styles.label}>Nome</Text>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Como quer ser chamado"
                placeholderTextColor={tokens.textLow}
                style={styles.input}
                maxLength={48}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                value={bioDraft}
                onChangeText={setBioDraft}
                placeholder="Uma linha sobre você"
                placeholderTextColor={tokens.textLow}
                style={[styles.input, styles.bioInput]}
                maxLength={160}
                multiline
                textAlignVertical="top"
              />

              <Text style={[styles.label, styles.sectionLabel]}>Imagens</Text>
              <View style={styles.imageGroup}>
                <SettingsRow
                  icon="person-circle-outline"
                  label="Foto de perfil"
                  detail={hasAvatar ? 'Toque para substituir' : 'Escolher da galeria ou câmera'}
                  showChevron
                  loading={imageUploading === 'avatar'}
                  onPress={onChangeAvatar}
                />
                {hasAvatar && onRemoveAvatar ? (
                  <SettingsRow
                    icon="trash-outline"
                    iconColor="#E57373"
                    label="Remover foto"
                    destructive
                    onPress={() => {
                      hapticDestructive();
                      onRemoveAvatar();
                    }}
                  />
                ) : null}
                <SettingsRow
                  icon="image-outline"
                  label="Capa do perfil"
                  detail={hasCover ? 'Toque para substituir' : 'Banner no topo do perfil'}
                  showChevron
                  loading={imageUploading === 'cover'}
                  last={!(hasCover && onRemoveCover)}
                  onPress={onChangeCover}
                />
                {hasCover && onRemoveCover ? (
                  <SettingsRow
                    icon="trash-outline"
                    iconColor="#E57373"
                    label="Remover capa"
                    destructive
                    last
                    onPress={() => {
                      hapticDestructive();
                      onRemoveCover();
                    }}
                  />
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    handleClose();
                  }}
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  onPress={handleSave}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && styles.pressed,
                    saving && styles.disabled,
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap: { paddingHorizontal: 12 },
  sheetScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: tokens.ink1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.textLow,
    marginTop: 10,
    marginBottom: 14,
  },
  title: { color: tokens.textHigh, fontSize: 17, fontWeight: '700', marginBottom: 16 },
  label: { color: tokens.textMid, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  sectionLabel: { marginTop: 4, marginBottom: 8 },
  imageGroup: {
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    marginBottom: 14,
    overflow: 'hidden',
  },
  input: {
    color: tokens.textHigh,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    marginBottom: 14,
  },
  bioInput: { minHeight: 88, paddingTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
  },
  cancelText: { color: tokens.textMid, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: tokens.accentDeep,
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },
});
