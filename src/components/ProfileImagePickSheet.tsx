import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import {
  attachmentFromGalleryPhoto,
  ensureGalleryPermission,
  isMediaLibraryAvailable,
  type GalleryPhoto,
} from '../lib/mediaLibraryRecent';
import {
  NativePickerUnavailableError,
  checkPickerAvailability,
  takePhotoWithCamera,
  type PickerAvailability,
} from '../lib/pickComposerAttachments';
import { hapticConfirm } from '../lib/haptics';
import { tokens } from '../theme/tokens';
import { AttachGalleryPanel } from './compositor/AttachGalleryPanel';

export type ProfileImageTarget = 'avatar' | 'cover';

interface Props {
  visible: boolean;
  target: ProfileImageTarget;
  onClose: () => void;
  onPick: (attachment: ComposerAttachment) => void;
}

function showRebuildAlert(moduleName: string) {
  Alert.alert(
    'Recompile o app',
    `O módulo ${moduleName} ainda não está no build instalado. Rode na pasta orbit-mobile:\n\nnpm run android:run\n\ne reinstale no celular.`,
    [{ text: 'Entendi' }],
  );
}

const TITLES: Record<ProfileImageTarget, string> = {
  avatar: 'Foto de perfil',
  cover: 'Capa do perfil',
};

/** Seleção de imagem — mesma galeria/câmara do composer, escolha única. */
export function ProfileImagePickSheet({ visible, target, onClose, onPick }: Props) {
  const { bottom: bottomInset } = useLayoutInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mediaLibraryOk, setMediaLibraryOk] = useState<boolean | null>(null);
  const [availability, setAvailability] = useState<PickerAvailability | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);

  const sheetHeight = useMemo(() => Math.min(windowHeight * 0.72, 560), [windowHeight]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    void checkPickerAvailability().then((next) => {
      if (!cancelled) setAvailability(next);
    });
    void isMediaLibraryAvailable().then((ok) => {
      if (!cancelled) setMediaLibraryOk(ok);
    });
    void ensureGalleryPermission().then((allowed) => {
      if (!cancelled) setPermissionDenied(!allowed);
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const finalizePick = useCallback(
    async (items: ComposerAttachment[]) => {
      const first = items[0];
      if (!first?.uri || pickBusy) return;
      setPickBusy(true);
      try {
        hapticConfirm();
        onPick(first);
        onClose();
      } finally {
        setPickBusy(false);
      }
    },
    [onClose, onPick, pickBusy],
  );

  const handlePickPhoto = useCallback(
    async (photo: GalleryPhoto) => {
      if (pickBusy) return;
      setPickBusy(true);
      try {
        const attachment = await attachmentFromGalleryPhoto(photo);
        hapticConfirm();
        onPick(attachment);
        onClose();
      } finally {
        setPickBusy(false);
      }
    },
    [onClose, onPick, pickBusy],
  );

  const handleOpenCamera = async () => {
    if (cameraBusy || pickBusy) return;
    if (availability && !availability.images) {
      showRebuildAlert('ExpoImagePicker');
      return;
    }

    setCameraBusy(true);
    try {
      const picked = await takePhotoWithCamera();
      await finalizePick(picked);
    } catch (err) {
      if (err instanceof NativePickerUnavailableError) showRebuildAlert(err.moduleName);
    } finally {
      setCameraBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />

        <View
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: Math.max(bottomInset, 8) },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{TITLES[target]}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={tokens.textMid} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Toque em uma foto ou use a câmera — igual ao composer.</Text>

          <View style={styles.panel}>
            <AttachGalleryPanel
              permissionDenied={permissionDenied}
              mediaLibraryOk={mediaLibraryOk}
              selectedUris={new Set()}
              onTogglePhoto={handlePickPhoto}
              onOpenCamera={handleOpenCamera}
              cameraBusy={cameraBusy || pickBusy}
            />
          </View>

          {pickBusy ? (
            <View style={styles.busyBar}>
              <ActivityIndicator color={tokens.onAccent} size="small" />
              <Text style={styles.busyText}>A preparar imagem…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: tokens.ink1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: { color: tokens.textHigh, fontSize: 17, fontWeight: '700' },
  hint: {
    color: tokens.textMid,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  panel: { flex: 1 },
  busyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: tokens.accentDeep,
  },
  busyText: { color: tokens.onAccent, fontSize: 13, fontWeight: '600' },
});
