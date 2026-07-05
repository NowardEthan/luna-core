import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GalleryPhoto } from '../../lib/mediaLibraryRecent';
import { tokens } from '../../theme/tokens';

const COLS = 3;
const GAP = 2;

interface Props {
  photos: GalleryPhoto[];
  loading: boolean;
  permissionDenied: boolean;
  photosEmpty?: boolean;
  selectedUris: ReadonlySet<string>;
  onTogglePhoto: (photo: GalleryPhoto) => void;
  onOpenCamera: () => void;
  onBrowseMore: () => void;
  onSelectPhotosAccess?: () => void;
  selectAccessBusy?: boolean;
  cameraBusy?: boolean;
}

export function AttachPhotoGrid({
  photos,
  loading,
  permissionDenied,
  photosEmpty = false,
  selectedUris,
  onTogglePhoto,
  onOpenCamera,
  onBrowseMore,
  onSelectPhotosAccess,
  selectAccessBusy = false,
  cameraBusy = false,
}: Props) {
  const { width } = useWindowDimensions();
  const cellSize = useMemo(
    () => Math.floor((width - GAP * (COLS - 1)) / COLS),
    [width],
  );

  const renderCell = useCallback(
    (node: React.ReactNode, key: string) => (
      <View key={key} style={{ width: cellSize, height: cellSize, marginBottom: GAP }}>
        {node}
      </View>
    ),
    [cellSize],
  );

  if (permissionDenied) {
    return (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={28} color={tokens.textLow} />
        <Text style={styles.emptyTitle}>Permissão da galeria necessária</Text>
        <Text style={styles.emptyHint}>Permita acesso às fotos nas configurações do sistema.</Text>
      </View>
    );
  }

  if (loading && photos.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.accentBright} />
        <Text style={styles.loadingLabel}>Carregando fotos…</Text>
      </View>
    );
  }

  if (photosEmpty && photos.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={28} color={tokens.textLow} />
        <Text style={styles.emptyTitle}>Nenhuma foto visível</Text>
        <Text style={styles.emptyHint}>
          Escolha quais fotos o Orbit pode mostrar, ou abra a galeria completa.
        </Text>
        <View style={styles.emptyActions}>
          {onSelectPhotosAccess ? (
            <Pressable
              style={styles.emptyBtn}
              onPress={onSelectPhotosAccess}
              disabled={selectAccessBusy}
            >
              {selectAccessBusy ? (
                <ActivityIndicator color={tokens.onAccent} size="small" />
              ) : (
                <Text style={styles.emptyBtnLabel}>Selecionar fotos</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable style={styles.emptyBtnSecondary} onPress={onBrowseMore}>
            <Text style={styles.emptyBtnSecondaryLabel}>Abrir galeria</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const cells: React.ReactNode[] = [];

  cells.push(
    renderCell(
      <Pressable
        style={[styles.cell, styles.cameraCell]}
        onPress={onOpenCamera}
        disabled={cameraBusy}
        accessibilityLabel="Tirar foto"
      >
        {cameraBusy ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Ionicons name="camera" size={30} color="#FFFFFF" />
        )}
      </Pressable>,
      'camera',
    ),
  );

  for (const photo of photos) {
    const selected = selectedUris.has(photo.uri);
    cells.push(
      renderCell(
        <Pressable
          style={styles.cell}
          onPress={() => onTogglePhoto(photo)}
          accessibilityLabel={photo.filename}
          accessibilityState={{ selected }}
        >
          <Image source={{ uri: photo.displayUri }} style={styles.thumb} resizeMode="cover" />
          <View style={[styles.selectRing, selected && styles.selectRingOn]}>
            {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </View>
        </Pressable>,
        photo.assetId,
      ),
    );
  }

  const rows: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i += COLS) {
    const rowCells = cells.slice(i, i + COLS);
    rows.push(
      <View key={`row-${i}`} style={styles.row}>
        {rowCells.map((cell, j) => (
          <View key={j} style={{ marginRight: j < rowCells.length - 1 ? GAP : 0 }}>
            {cell}
          </View>
        ))}
        {rowCells.length < COLS
          ? Array.from({ length: COLS - rowCells.length }).map((_, j) => (
              <View
                key={`pad-${j}`}
                style={{ width: cellSize, marginRight: j < COLS - rowCells.length - 1 ? GAP : 0 }}
              />
            ))
          : null}
      </View>,
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {rows}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    overflow: 'hidden',
    backgroundColor: tokens.ink1,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  cameraCell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  selectRing: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRingOn: {
    backgroundColor: tokens.accent,
    borderColor: '#FFFFFF',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingLabel: {
    fontSize: 13,
    color: tokens.textMid,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.textLow,
    textAlign: 'center',
  },
  emptyActions: {
    marginTop: 10,
    gap: 8,
    alignItems: 'center',
  },
  emptyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.accent,
    minWidth: 180,
    alignItems: 'center',
  },
  emptyBtnLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.onAccent,
  },
  emptyBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyBtnSecondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.accentBright,
  },
});
