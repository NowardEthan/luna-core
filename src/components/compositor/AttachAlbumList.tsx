import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GalleryAlbum } from '../../lib/mediaLibraryRecent';
import { tokens } from '../../theme/tokens';

interface Props {
  albums: GalleryAlbum[];
  loading: boolean;
  onSelectAlbum: (album: GalleryAlbum) => void;
  onSelectAllPhotos: () => void;
}

export function AttachAlbumList({ albums, loading, onSelectAlbum, onSelectAllPhotos }: Props) {
  if (loading && albums.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.accentBright} />
        <Text style={styles.loadingLabel}>Carregando pastas…</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={albums}
      keyExtractor={(item) => item.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <Pressable
          style={({ pressed }) => [styles.allRow, pressed && styles.rowPressed]}
          onPress={onSelectAllPhotos}
          accessibilityLabel="Todas as fotos"
        >
          <View style={styles.allIcon}>
            <Ionicons name="images" size={22} color={tokens.accentBright} />
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.allTitle}>Todas as fotos</Text>
            <Text style={styles.allHint}>Galeria completa do dispositivo</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
        </Pressable>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.albumRow, pressed && styles.rowPressed]}
          onPress={() => onSelectAlbum(item)}
          accessibilityLabel={`Pasta ${item.title}`}
        >
          <View style={styles.coverWrap}>
            {item.coverUri ? (
              <Image source={{ uri: item.coverUri }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={styles.coverFallback}>
                <Ionicons name="folder-outline" size={20} color={tokens.textMid} />
              </View>
            )}
          </View>
          <View style={styles.rowMeta}>
            <Text style={styles.albumTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.albumCount}>
              {item.assetCount} {item.assetCount === 1 ? 'foto' : 'fotos'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
        </Pressable>
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.emptyHint}>Nenhuma pasta encontrada neste dispositivo.</Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 12 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingLabel: {
    fontSize: 13,
    color: tokens.textMid,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(136, 193, 242, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(136, 193, 242, 0.2)',
    marginBottom: 12,
  },
  allIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(136, 193, 242, 0.16)',
  },
  allTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.textHigh,
  },
  allHint: {
    fontSize: 12,
    color: tokens.textLow,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowPressed: { opacity: 0.82 },
  coverWrap: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.ink1,
  },
  cover: { width: '100%', height: '100%' },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowMeta: { flex: 1, minWidth: 0, gap: 2 },
  albumTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textHigh,
  },
  albumCount: {
    fontSize: 12,
    color: tokens.textLow,
  },
  emptyHint: {
    fontSize: 13,
    color: tokens.textLow,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
});
