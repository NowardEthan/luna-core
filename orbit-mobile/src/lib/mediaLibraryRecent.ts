import {
  attachmentKindFromMime,
  newAttachmentId,
  type ComposerAttachment,
} from './composerAttachmentModel';
import { NativePickerUnavailableError } from './pickComposerAttachments';

type MediaLibraryModule = typeof import('expo-media-library');
type MLAsset = import('expo-media-library').Asset;

let mediaLibraryMod: MediaLibraryModule | null | undefined;

const PAGE_SIZE = 48;

async function getMediaLibrary(): Promise<MediaLibraryModule | null> {
  if (mediaLibraryMod !== undefined) return mediaLibraryMod;
  try {
    mediaLibraryMod = await import('expo-media-library');
    return mediaLibraryMod;
  } catch {
    mediaLibraryMod = null;
    return null;
  }
}

export type GalleryPhoto = {
  assetId: string;
  /** URI estável para seleção (asset id). */
  uri: string;
  /** URI renderizável no `<Image>`. */
  displayUri: string;
  filename: string;
};

export type GalleryAlbum = {
  id: string;
  title: string;
  assetCount: number;
  coverUri?: string;
};

export type GalleryPhotosPage = {
  photos: GalleryPhoto[];
  endCursor: string;
  hasNextPage: boolean;
};

function mimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

function hasGalleryAccess(perm: { granted: boolean; accessPrivileges?: string }): boolean {
  return perm.granted || perm.accessPrivileges === 'limited';
}

function assetToPhoto(asset: MLAsset): GalleryPhoto {
  return {
    assetId: asset.id,
    uri: asset.id,
    displayUri: asset.uri,
    filename: asset.filename,
  };
}

export async function isMediaLibraryAvailable(): Promise<boolean> {
  return (await getMediaLibrary()) != null;
}

export async function ensureGalleryPermission(): Promise<boolean> {
  const ML = await getMediaLibrary();
  if (!ML) return false;

  const granular = ['photo'] as import('expo-media-library').GranularPermission[];
  const current = await ML.getPermissionsAsync(false, granular);
  if (hasGalleryAccess(current)) return true;

  const next = await ML.requestPermissionsAsync(false, granular);
  return hasGalleryAccess(next);
}

/** Abre o picker do sistema para escolher mais fotos (Android 14+ / iOS limitado). */
export async function openGalleryPermissionPicker(): Promise<void> {
  const ML = await getMediaLibrary();
  if (!ML) throw new NativePickerUnavailableError('ExpoMediaLibrary');

  try {
    await ML.presentPermissionsPickerAsync(['photo']);
  } catch {
    await ML.requestPermissionsAsync(false, ['photo']);
  }
}

/** Pastas/álbuns do dispositivo. */
export async function loadGalleryAlbums(): Promise<GalleryAlbum[]> {
  const ML = await getMediaLibrary();
  if (!ML) throw new NativePickerUnavailableError('ExpoMediaLibrary');

  const allowed = await ensureGalleryPermission();
  if (!allowed) return [];

  const raw = await ML.getAlbumsAsync({ includeSmartAlbums: true });
  const withAlbums = raw.filter((album) => album.assetCount > 0);

  const albums = await Promise.all(
    withAlbums.map(async (album) => {
      let coverUri: string | undefined;
      try {
        const cover = await ML.getAssetsAsync({
          first: 1,
          album: album.id,
          mediaType: ML.MediaType.photo,
          sortBy: [[ML.SortBy.creationTime, false]],
        });
        coverUri = cover.assets[0]?.uri;
      } catch {
        /* capa opcional */
      }
      return {
        id: album.id,
        title: album.title?.trim() || 'Sem nome',
        assetCount: album.assetCount,
        coverUri,
      };
    }),
  );

  albums.sort((a, b) => b.assetCount - a.assetCount);
  return albums;
}

/** Página de fotos — todas ou de um álbum. */
export async function loadGalleryPhotosPage(opts: {
  albumId?: string | null;
  after?: string;
  first?: number;
}): Promise<GalleryPhotosPage> {
  const ML = await getMediaLibrary();
  if (!ML) throw new NativePickerUnavailableError('ExpoMediaLibrary');

  const allowed = await ensureGalleryPermission();
  if (!allowed) return { photos: [], endCursor: '', hasNextPage: false };

  const page = await ML.getAssetsAsync({
    first: opts.first ?? PAGE_SIZE,
    after: opts.after,
    album: opts.albumId ?? undefined,
    mediaType: ML.MediaType.photo,
    sortBy: [[ML.SortBy.creationTime, false]],
  });

  return {
    photos: page.assets.map(assetToPhoto),
    endCursor: page.endCursor,
    hasNextPage: page.hasNextPage,
  };
}

/** Atalho — primeira página recente. */
export async function loadRecentGalleryPhotos(limit = PAGE_SIZE): Promise<GalleryPhoto[]> {
  const page = await loadGalleryPhotosPage({ first: limit });
  return page.photos;
}

export function galleryPhotoFromAttachment(att: ComposerAttachment): GalleryPhoto | null {
  if (att.kind !== 'image' || !att.uri) return null;
  return {
    assetId: att.id,
    uri: att.uri,
    displayUri: att.uri,
    filename: att.name,
  };
}

export async function attachmentFromGalleryPhoto(photo: GalleryPhoto): Promise<ComposerAttachment> {
  const ML = await getMediaLibrary();
  let uri = photo.displayUri;
  let size = 0;
  let filename = photo.filename || `foto-${Date.now()}.jpg`;

  if (photo.assetId.startsWith('att-')) {
    const mime = mimeFromFilename(filename);
    return {
      id: newAttachmentId(),
      kind: attachmentKindFromMime(mime),
      name: filename,
      size,
      mime,
      uri: photo.displayUri,
    };
  }

  if (ML) {
    try {
      const info = await ML.getAssetInfoAsync(photo.assetId);
      uri = info.localUri ?? info.uri ?? photo.displayUri;
      const infoSize = (info as { fileSize?: number }).fileSize;
      size = typeof infoSize === 'number' ? infoSize : 0;
      filename = info.filename ?? filename;
    } catch {
      /* usa dados básicos */
    }
  }

  const mime = mimeFromFilename(filename);
  return {
    id: newAttachmentId(),
    kind: attachmentKindFromMime(mime),
    name: filename,
    size,
    mime,
    uri,
  };
}

export function galleryPhotoKey(photo: GalleryPhoto): string {
  return photo.assetId;
}

export function attachmentGalleryKey(att: ComposerAttachment): string | null {
  return att.uri ?? null;
}
