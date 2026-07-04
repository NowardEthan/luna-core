import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  loadGalleryAlbums,
  loadGalleryPhotosPage,
  openGalleryPermissionPicker,
  type GalleryAlbum,
  type GalleryPhoto,
} from '../../lib/mediaLibraryRecent';
import { tokens } from '../../theme/tokens';
import { AttachAlbumList } from './AttachAlbumList';

const COLS = 3;
const GAP = 2;

type GridItem =
  | { kind: 'camera'; key: string }
  | { kind: 'photo'; key: string; photo: GalleryPhoto };

interface Props {
  permissionDenied: boolean;
  mediaLibraryOk: boolean | null;
  selectedUris: ReadonlySet<string>;
  onTogglePhoto: (photo: GalleryPhoto) => void;
  onOpenCamera: () => void;
  cameraBusy?: boolean;
  reloadKey?: number;
}

export function AttachGalleryPanel({
  permissionDenied,
  mediaLibraryOk,
  selectedUris,
  onTogglePhoto,
  onOpenCamera,
  cameraBusy = false,
  reloadKey = 0,
}: Props) {
  const { width } = useWindowDimensions();
  const cellStyle = useMemo(
    () => ({
      flex: 1 as const,
      aspectRatio: 1 as const,
      maxWidth: (width - GAP * (COLS - 1)) / COLS,
    }),
    [width],
  );
  const [subView, setSubView] = useState<'photos' | 'albums'>('photos');
  const [activeAlbum, setActiveAlbum] = useState<GalleryAlbum | null>(null);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [photosEmpty, setPhotosEmpty] = useState(false);
  const [selectAccessBusy, setSelectAccessBusy] = useState(false);

  const cursorRef = useRef<string | undefined>(undefined);
  const loadingMoreRef = useRef(false);

  const gridData = useMemo<GridItem[]>(() => {
    const items: GridItem[] = [{ kind: 'camera', key: 'camera' }];
    for (const photo of photos) {
      items.push({ kind: 'photo', key: photo.assetId, photo });
    }
    return items;
  }, [photos]);

  const resetPhotos = useCallback(() => {
    cursorRef.current = undefined;
    setPhotos([]);
    setHasMore(true);
    setPhotosEmpty(false);
  }, []);

  const loadPhotosPage = useCallback(
    async (reset: boolean) => {
      if (loadingMoreRef.current && !reset) return;
      loadingMoreRef.current = true;
      if (reset) setLoadingInitial(true);
      else setLoadingMore(true);

      try {
        const page = await loadGalleryPhotosPage({
          albumId: activeAlbum?.id ?? null,
          after: reset ? undefined : cursorRef.current,
        });
        cursorRef.current = page.endCursor;
        setHasMore(page.hasNextPage);
        setPhotos((prev) => (reset ? page.photos : [...prev, ...page.photos]));
        if (reset) setPhotosEmpty(page.photos.length === 0);
      } catch {
        if (reset) {
          setPhotos([]);
          setPhotosEmpty(true);
          setHasMore(false);
        }
      } finally {
        loadingMoreRef.current = false;
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [activeAlbum?.id],
  );

  useEffect(() => {
    if (permissionDenied || mediaLibraryOk === false) return;
    resetPhotos();
    void loadPhotosPage(true);
  }, [activeAlbum?.id, loadPhotosPage, mediaLibraryOk, permissionDenied, reloadKey, resetPhotos]);

  useEffect(() => {
    if (subView !== 'albums' || permissionDenied || mediaLibraryOk === false) return;
    setLoadingAlbums(true);
    void loadGalleryAlbums()
      .then(setAlbums)
      .catch(() => setAlbums([]))
      .finally(() => setLoadingAlbums(false));
  }, [mediaLibraryOk, permissionDenied, reloadKey, subView]);

  const handleSelectAllPhotos = () => {
    setActiveAlbum(null);
    setSubView('photos');
  };

  const handleSelectAlbum = (album: GalleryAlbum) => {
    setActiveAlbum(album);
    setSubView('photos');
  };

  const handleSelectPhotosAccess = async () => {
    setSelectAccessBusy(true);
    try {
      await openGalleryPermissionPicker();
      resetPhotos();
      await loadPhotosPage(true);
    } finally {
      setSelectAccessBusy(false);
    }
  };

  const headerTitle =
    subView === 'albums'
      ? 'Pastas'
      : activeAlbum
        ? activeAlbum.title
        : 'Todas as fotos';

  const renderGridItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.kind === 'camera') {
        return (
          <Pressable
            style={[styles.cell, cellStyle, styles.cameraCell]}
            onPress={onOpenCamera}
            disabled={cameraBusy}
            accessibilityLabel="Tirar foto"
          >
            {cameraBusy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="camera" size={30} color="#FFFFFF" />
            )}
          </Pressable>
        );
      }

      const selected = selectedUris.has(item.photo.uri);
      return (
        <Pressable
          style={[styles.cell, cellStyle]}
          onPress={() => onTogglePhoto(item.photo)}
          accessibilityLabel={item.photo.filename}
          accessibilityState={{ selected }}
        >
          <Image source={{ uri: item.photo.displayUri }} style={styles.thumb} resizeMode="cover" />
          <View style={[styles.selectRing, selected && styles.selectRingOn]}>
            {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </View>
        </Pressable>
      );
    },
    [cameraBusy, cellStyle, onOpenCamera, onTogglePhoto, selectedUris],
  );

  if (mediaLibraryOk === false) {
    return (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={28} color={tokens.textLow} />
        <Text style={styles.emptyTitle}>Galeria indisponível neste build</Text>
        <Text style={styles.emptyHint}>Recompila com expo-media-library (npm run android:run).</Text>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={28} color={tokens.textLow} />
        <Text style={styles.emptyTitle}>Permissão da galeria necessária</Text>
        <Text style={styles.emptyHint}>Permite acesso às fotos nas definições do sistema.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {subView === 'photos' && activeAlbum ? (
          <Pressable
            style={styles.headerBtn}
            onPress={() => setActiveAlbum(null)}
            hitSlop={8}
            accessibilityLabel="Voltar para todas as fotos"
          >
            <Ionicons name="chevron-back" size={22} color={tokens.textHigh} />
          </Pressable>
        ) : subView === 'albums' ? (
          <Pressable
            style={styles.headerBtn}
            onPress={() => setSubView('photos')}
            hitSlop={8}
            accessibilityLabel="Voltar para fotos"
          >
            <Ionicons name="chevron-back" size={22} color={tokens.textHigh} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}

        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>

        {subView === 'photos' ? (
          <Pressable
            style={styles.headerBtn}
            onPress={() => setSubView('albums')}
            hitSlop={8}
            accessibilityLabel="Ver pastas"
          >
            <Ionicons name="folder-outline" size={22} color={tokens.accentBright} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {subView === 'albums' ? (
        <AttachAlbumList
          albums={albums}
          loading={loadingAlbums}
          onSelectAlbum={handleSelectAlbum}
          onSelectAllPhotos={handleSelectAllPhotos}
        />
      ) : loadingInitial && photos.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.accentBright} />
          <Text style={styles.loadingLabel}>A carregar fotos…</Text>
        </View>
      ) : photosEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={28} color={tokens.textLow} />
          <Text style={styles.emptyTitle}>Nenhuma foto visível</Text>
          <Text style={styles.emptyHint}>
            Escolhe quais fotos o Orbit pode aceder ou abre as pastas.
          </Text>
          <View style={styles.emptyActions}>
            <Pressable
              style={styles.emptyBtn}
              onPress={handleSelectPhotosAccess}
              disabled={selectAccessBusy}
            >
              {selectAccessBusy ? (
                <ActivityIndicator color={tokens.onAccent} size="small" />
              ) : (
                <Text style={styles.emptyBtnLabel}>Seleccionar fotos</Text>
              )}
            </Pressable>
            <Pressable style={styles.emptyBtnSecondary} onPress={() => setSubView('albums')}>
              <Text style={styles.emptyBtnSecondaryLabel}>Ver pastas</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(item) => item.key}
          numColumns={COLS}
          style={styles.grid}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={renderGridItem}
          onEndReached={() => {
            if (hasMore && !loadingInitial) void loadPhotosPage(false);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={tokens.accentBright} size="small" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
    gap: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
    textAlign: 'center',
  },
  grid: { flex: 1 },
  gridContent: { paddingBottom: 8 },
  gridRow: { gap: GAP, marginBottom: GAP },
  cell: {
    overflow: 'hidden',
    backgroundColor: tokens.ink1,
  },
  thumb: { width: '100%', height: '100%' },
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
  },
  loadingLabel: { fontSize: 13, color: tokens.textMid },
  footer: { paddingVertical: 16, alignItems: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
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
  emptyActions: { marginTop: 10, gap: 8, alignItems: 'center' },
  emptyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.accent,
    minWidth: 180,
    alignItems: 'center',
  },
  emptyBtnLabel: { fontSize: 14, fontWeight: '600', color: tokens.onAccent },
  emptyBtnSecondary: { paddingHorizontal: 14, paddingVertical: 8 },
  emptyBtnSecondaryLabel: { fontSize: 13, fontWeight: '600', color: tokens.accentBright },
});
