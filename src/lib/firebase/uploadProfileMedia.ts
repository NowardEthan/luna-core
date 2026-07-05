import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import type { ComposerAttachment } from '../composerAttachmentModel';
import { getLunaStorage } from './storageClient';
import { isRemoteMediaUri, localUriToBlob } from './uploadChatMedia';

export type ProfileImageKind = 'avatar' | 'cover';

function extensionFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/** Envia avatar ou capa para `users/{uid}/profile/{kind}.{ext}`. */
export async function uploadProfileImage(
  uid: string,
  kind: ProfileImageKind,
  attachment: ComposerAttachment,
): Promise<string> {
  if (!attachment.uri) throw new Error('Imagem sem URI.');
  if (isRemoteMediaUri(attachment.uri)) return attachment.uri;

  const storage = getLunaStorage();
  if (!storage) throw new Error('Firebase Storage não configurado.');

  const ext = extensionFromMime(attachment.mime || 'image/jpeg');
  const storagePath = `users/${uid}/profile/${kind}.${ext}`;
  const storageRef = ref(storage, storagePath);
  const blob = await localUriToBlob(attachment.uri);

  await uploadBytes(storageRef, blob, {
    contentType: attachment.mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    customMetadata: { kind },
  });

  return getDownloadURL(storageRef);
}
