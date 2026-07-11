import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  attachmentKindFromMime,
  newAttachmentId,
  type ComposerAttachment,
} from './composerAttachmentModel';

export class NativePickerUnavailableError extends Error {
  readonly moduleName: string;

  constructor(moduleName: string) {
    super(`Módulo nativo indisponível: ${moduleName}`);
    this.name = 'NativePickerUnavailableError';
    this.moduleName = moduleName;
  }
}

type ImagePickerModule = typeof import('expo-image-picker');
type DocumentPickerModule = typeof import('expo-document-picker');

let imagePickerMod: ImagePickerModule | null | undefined;
let documentPickerMod: DocumentPickerModule | null | undefined;

async function getImagePicker(): Promise<ImagePickerModule | null> {
  if (imagePickerMod !== undefined) return imagePickerMod;
  try {
    imagePickerMod = await import('expo-image-picker');
    return imagePickerMod;
  } catch {
    imagePickerMod = null;
    return null;
  }
}

async function getDocumentPicker(): Promise<DocumentPickerModule | null> {
  if (documentPickerMod !== undefined) return documentPickerMod;
  try {
    documentPickerMod = await import('expo-document-picker');
    return documentPickerMod;
  } catch {
    documentPickerMod = null;
    return null;
  }
}

export type PickerAvailability = {
  images: boolean;
  documents: boolean;
};

/** Verifica se os módulos nativos estão no build actual (sem crashar o app). */
export async function checkPickerAvailability(): Promise<PickerAvailability> {
  const [images, documents] = await Promise.all([getImagePicker(), getDocumentPicker()]);
  return {
    images: images != null,
    documents: documents != null,
  };
}

function imageAssetToAttachment(
  asset: import('expo-image-picker').ImagePickerAsset,
): ComposerAttachment {
  const mime = asset.mimeType ?? 'image/jpeg';
  const name =
    asset.fileName ??
    (mime.includes('png') ? `imagem-${Date.now()}.png` : `imagem-${Date.now()}.jpg`);
  return {
    id: newAttachmentId(),
    kind: 'image',
    name,
    size: asset.fileSize ?? 0,
    mime,
    uri: asset.uri,
  };
}

function documentAssetToAttachment(
  asset: import('expo-document-picker').DocumentPickerAsset,
): ComposerAttachment {
  const mime = asset.mimeType ?? 'application/octet-stream';
  const name = asset.name ?? `arquivo-${Date.now()}`;
  return {
    id: newAttachmentId(),
    kind: 'file',
    name,
    size: asset.size ?? 0,
    mime,
    uri: asset.uri,
  };
}

export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const ImagePicker = await getImagePicker();
  if (!ImagePicker) return false;
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return next.granted;
}

export async function ensureCameraPermission(): Promise<boolean> {
  const ImagePicker = await getImagePicker();
  if (!ImagePicker) return false;
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestCameraPermissionsAsync();
  return next.granted;
}

export async function pickImagesFromGallery(): Promise<ComposerAttachment[]> {
  const ImagePicker = await getImagePicker();
  if (!ImagePicker) throw new NativePickerUnavailableError('ExpoImagePicker');

  const allowed = await ensureMediaLibraryPermission();
  if (!allowed) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map(imageAssetToAttachment);
}

export async function takePhotoWithCamera(): Promise<ComposerAttachment[]> {
  const ImagePicker = await getImagePicker();
  if (!ImagePicker) throw new NativePickerUnavailableError('ExpoImagePicker');

  const allowed = await ensureCameraPermission();
  if (!allowed) return [];

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map(imageAssetToAttachment);
}

/**
 * Copia um arquivo (URI `content://` do SAF vindo dos recentes/navegador do
 * dispositivo, ou um `file://` de cache possivelmente já obsoleto) para um
 * arquivo NOVO no cache do app, devolvendo um `file://` legível — o mesmo que o
 * picker nativo faz com `copyToCacheDirectory: true`. Sem isso, ler o arquivo no
 * envio (`new File(uri).base64()`) falha para content:// / cache limpo e a
 * mensagem estoura "Não consegui ler o arquivo anexado".
 *
 * Defensivo: se a cópia falhar (arquivo sumiu, API indisponível), devolve o
 * anexo ORIGINAL sem alteração — nunca regride o caminho que já funcionava.
 * Só se aplica a `kind === 'file'`; imagens da galeria já chegam com localUri.
 */
export async function materializeFileToCache(att: ComposerAttachment): Promise<ComposerAttachment> {
  if (att.kind !== 'file' || !att.uri) return att;
  const uri = att.uri;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return att; // já remoto
  try {
    const src = new File(uri);
    const safeName = (att.name || `arquivo-${Date.now()}`).replace(/[^\w.\-]+/g, '_');
    const dest = new File(Paths.cache, `luna-att-${newAttachmentId()}-${safeName}`);
    await src.copy(dest);
    return { ...att, uri: dest.uri };
  } catch {
    return att;
  }
}

export async function pickDocuments(): Promise<ComposerAttachment[]> {
  const DocumentPicker = await getDocumentPicker();
  if (!DocumentPicker) throw new NativePickerUnavailableError('ExpoDocumentPicker');

  // Android: */* abre o gerenciador do sistema sem pedir acesso a pastas (SAF bloqueado em muitos aparelhos).
  const result = await DocumentPicker.getDocumentAsync({
    type:
      Platform.OS === 'android'
        ? '*/*'
        : [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/*',
            'application/json',
            'application/xml',
            'application/zip',
            'application/epub+zip',
          ],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const assets = result.assets ?? [];
  return assets.map(documentAssetToAttachment);
}
