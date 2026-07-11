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
import type { ComposerAttachment } from '../../lib/composerAttachmentModel';
import { useLayoutInsets } from '../../hooks/useLayoutInsets';
import {
  attachmentFromGalleryPhoto,
  ensureGalleryPermission,
  isMediaLibraryAvailable,
  type GalleryPhoto,
} from '../../lib/mediaLibraryRecent';
import {
  attachmentFromBrowserEntry,
  attachmentFromRecentFile,
  type FileBrowserEntry,
} from '../../lib/deviceFileBrowser';
import {
  NativePickerUnavailableError,
  checkPickerAvailability,
  materializeFileToCache,
  pickDocuments,
  takePhotoWithCamera,
  type PickerAvailability,
} from '../../lib/pickComposerAttachments';
import { loadRecentFiles, rememberRecentFiles } from '../../lib/recentFileCache';
import { hapticConfirm, hapticListTap } from '../../lib/haptics';
import { tokens } from '../../theme/tokens';
import { AttachBottomBar } from './AttachBottomBar';
import { AttachFileBrowserPanel } from './AttachFileBrowserPanel';
import { AttachGalleryPanel } from './AttachGalleryPanel';

interface Props {
  visible: boolean;
  disabled?: boolean;
  /** Quantas imagens ainda cabem nesta mensagem (max − já anexadas no composer). */
  imageBudget?: number;
  /** Quantos arquivos ainda cabem nesta mensagem. */
  fileBudget?: number;
  /** Teto total de imagens por mensagem (para a mensagem de limite). */
  maxImages?: number;
  /** Teto total de arquivos por mensagem. */
  maxFiles?: number;
  onClose: () => void;
  onPick: (attachments: ComposerAttachment[]) => void;
}

type Tab = 'photos' | 'files';

function showRebuildAlert(moduleName: string) {
  Alert.alert(
    'Recompile o app',
    `O módulo ${moduleName} ainda não está no build instalado. Rode na pasta orbit-mobile:\n\nnpm run android:run\n\ne reinstale no celular.`,
    [{ text: 'Entendi' }],
  );
}

async function finalizePick(
  items: ComposerAttachment[],
  onPick: (attachments: ComposerAttachment[]) => void,
  onClose: () => void,
) {
  if (items.length === 0) return;
  // Materializa arquivos (content:// do SAF / cache obsoleto) num file:// fresco
  // e legível antes de anexar — evita o "Não consegui ler o arquivo" no envio.
  const ready = await Promise.all(items.map(materializeFileToCache));
  await rememberRecentFiles(ready);
  onPick(ready);
  onClose();
}

export function ComposerAttachSheet({
  visible,
  disabled = false,
  imageBudget = Infinity,
  fileBudget = Infinity,
  maxImages,
  maxFiles,
  onClose,
  onPick,
}: Props) {
  const { bottom: bottomInset } = useLayoutInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>('photos');
  const [recentFiles, setRecentFiles] = useState<ComposerAttachment[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedPhotoUris, setSelectedPhotoUris] = useState<Set<string>>(() => new Set());
  const [selectedFileUris, setSelectedFileUris] = useState<Set<string>>(() => new Set());
  const [photoSelection, setPhotoSelection] = useState<Map<string, GalleryPhoto>>(() => new Map());
  const [fileSelection, setFileSelection] = useState<Map<string, ComposerAttachment>>(() => new Map());
  const [availability, setAvailability] = useState<PickerAvailability | null>(null);
  const [mediaLibraryOk, setMediaLibraryOk] = useState<boolean | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [browseFilesBusy, setBrowseFilesBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [filesReloadKey, setFilesReloadKey] = useState(0);
  const [galleryReloadKey] = useState(0);

  const sheetHeight = useMemo(() => Math.min(windowHeight * 0.78, 620), [windowHeight]);
  const selectedCount = selectedPhotoUris.size + selectedFileUris.size;
  const imageLimitMsg = maxImages
    ? `A Luna analisa até ${maxImages} imagens por mensagem.`
    : 'Limite de imagens desta mensagem atingido.';
  const fileLimitMsg = maxFiles
    ? `A Luna analisa até ${maxFiles} arquivos por mensagem.`
    : 'Limite de arquivos desta mensagem atingido.';

  const resetSelection = useCallback(() => {
    setSelectedPhotoUris(new Set());
    setSelectedFileUris(new Set());
    setPhotoSelection(new Map());
    setFileSelection(new Map());
  }, []);

  useEffect(() => {
    if (visible) return;
    setTab('photos');
    resetSelection();
    setLimitNotice(null);
  }, [resetSelection, visible]);

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

    setLoadingFiles(true);
    void loadRecentFiles()
      .then((items) => {
        if (!cancelled) setRecentFiles(items);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [galleryReloadKey, visible]);

  const togglePhoto = useCallback((photo: GalleryPhoto) => {
    // Limita a seleção ao orçamento de imagens da mensagem — feedback ao vivo,
    // em vez do Alert "o restante não foi anexado" só depois de confirmar.
    if (!selectedPhotoUris.has(photo.uri) && selectedPhotoUris.size >= imageBudget) {
      setLimitNotice(imageLimitMsg);
      hapticListTap();
      return;
    }
    setLimitNotice(null);
    hapticListTap();
    setSelectedPhotoUris((prev) => {
      const next = new Set(prev);
      if (next.has(photo.uri)) next.delete(photo.uri);
      else next.add(photo.uri);
      return next;
    });
    setPhotoSelection((prev) => {
      const next = new Map(prev);
      if (next.has(photo.uri)) next.delete(photo.uri);
      else next.set(photo.uri, photo);
      return next;
    });
  }, [imageBudget, imageLimitMsg, selectedPhotoUris]);

  const toggleFile = useCallback((file: ComposerAttachment) => {
    if (!file.uri) return;
    const uri = file.uri;
    if (!selectedFileUris.has(uri) && selectedFileUris.size >= fileBudget) {
      setLimitNotice(fileLimitMsg);
      hapticListTap();
      return;
    }
    setLimitNotice(null);
    hapticListTap();
    setSelectedFileUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
    setFileSelection((prev) => {
      const next = new Map(prev);
      if (next.has(uri)) next.delete(uri);
      else next.set(uri, attachmentFromRecentFile(file));
      return next;
    });
  }, [fileBudget, fileLimitMsg, selectedFileUris]);

  const toggleBrowserEntry = useCallback((entry: FileBrowserEntry) => {
    if (entry.kind !== 'file') return;
    const uri = entry.uri;
    if (!selectedFileUris.has(uri) && selectedFileUris.size >= fileBudget) {
      setLimitNotice(fileLimitMsg);
      hapticListTap();
      return;
    }
    setLimitNotice(null);
    hapticListTap();
    setSelectedFileUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
    setFileSelection((prev) => {
      const next = new Map(prev);
      if (next.has(uri)) next.delete(uri);
      else next.set(uri, attachmentFromBrowserEntry(entry));
      return next;
    });
  }, [fileBudget, fileLimitMsg, selectedFileUris]);

  const handleConfirm = async () => {
    if (disabled || confirmBusy || selectedCount === 0) return;

    hapticConfirm();
    setConfirmBusy(true);
    try {
      const selectedPhotos = [...photoSelection.values()];
      const photoAttachments = await Promise.all(selectedPhotos.map(attachmentFromGalleryPhoto));
      const fileAttachments = [...fileSelection.values()];
      await finalizePick([...photoAttachments, ...fileAttachments], onPick, onClose);
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleOpenCamera = async () => {
    if (disabled || cameraBusy) return;
    if (availability && !availability.images) {
      showRebuildAlert('ExpoImagePicker');
      return;
    }

    setCameraBusy(true);
    try {
      const picked = await takePhotoWithCamera();
      await finalizePick(picked, onPick, onClose);
    } catch (err) {
      if (err instanceof NativePickerUnavailableError) showRebuildAlert(err.moduleName);
    } finally {
      setCameraBusy(false);
    }
  };

  const handleBrowseDevice = async () => {
    if (disabled || browseFilesBusy) return;
    if (availability && !availability.documents) {
      showRebuildAlert('ExpoDocumentPicker');
      return;
    }

    setBrowseFilesBusy(true);
    try {
      const picked = await pickDocuments();
      // Respeita o orçamento de arquivos da mensagem — o picker nativo permite
      // escolher vários, então cortamos o excedente aqui e avisamos.
      const room = Math.max(0, fileBudget - selectedFileUris.size);
      const accepted = picked.slice(0, room);
      if (picked.length > accepted.length) setLimitNotice(fileLimitMsg);
      for (const file of accepted) {
        if (!file.uri) continue;
        const uri = file.uri;
        setSelectedFileUris((prev) => new Set(prev).add(uri));
        setFileSelection((prev) => {
          const next = new Map(prev);
          next.set(uri, attachmentFromRecentFile(file));
          return next;
        });
      }
      if (picked.length > 0) {
        setRecentFiles((prev) => {
          const merged = [...picked];
          for (const f of prev) {
            if (!merged.some((m) => m.uri === f.uri)) merged.push(f);
          }
          return merged.slice(0, 40);
        });
        setFilesReloadKey((k) => k + 1);
      }
    } catch (err) {
      if (err instanceof NativePickerUnavailableError) showRebuildAlert(err.moduleName);
    } finally {
      setBrowseFilesBusy(false);
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
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar anexos" />

        <View
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: Math.max(bottomInset, 8) },
          ]}
        >
          <View style={styles.panel}>
            {tab === 'photos' ? (
              <AttachGalleryPanel
                permissionDenied={permissionDenied}
                mediaLibraryOk={mediaLibraryOk}
                selectedUris={selectedPhotoUris}
                onTogglePhoto={togglePhoto}
                onOpenCamera={handleOpenCamera}
                cameraBusy={cameraBusy}
                reloadKey={galleryReloadKey}
              />
            ) : (
              <AttachFileBrowserPanel
                recentFiles={recentFiles}
                loadingRecent={loadingFiles}
                selectedUris={selectedFileUris}
                onToggleFile={toggleFile}
                onToggleEntry={toggleBrowserEntry}
                onBrowseDevice={handleBrowseDevice}
                browseBusy={browseFilesBusy}
                reloadKey={filesReloadKey}
              />
            )}
          </View>

          {limitNotice ? (
            <View style={styles.limitBanner}>
              <Ionicons name="information-circle-outline" size={16} color={tokens.warning} />
              <Text style={styles.limitText}>{limitNotice}</Text>
            </View>
          ) : null}

          {selectedCount > 0 ? (
            <Pressable
              style={[styles.confirmBtn, (disabled || confirmBusy) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={disabled || confirmBusy}
              accessibilityLabel={`Anexar ${selectedCount} item${selectedCount === 1 ? '' : 's'}`}
            >
              {confirmBusy ? (
                <ActivityIndicator color={tokens.onAccent} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={tokens.onAccent} />
                  <Text style={styles.confirmLabel}>
                    Anexar {selectedCount} {selectedCount === 1 ? 'item' : 'itens'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}

          <AttachBottomBar active={tab} onChange={setTab} onDismiss={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 22, 0.5)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  panel: {
    flex: 1,
    minHeight: 120,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: tokens.warningSoft,
  },
  limitText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: tokens.warning,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginVertical: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.accent,
  },
  confirmBtnDisabled: {
    opacity: 0.55,
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.onAccent,
  },
});
