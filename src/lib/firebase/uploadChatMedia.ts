import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import type { ComposerAttachment } from '../composerAttachmentModel';
import type { VoiceClip } from '../../data/fixtures';
import { getLunaStorage } from './storageClient';

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-()+@]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'arquivo';
}

export function isRemoteMediaUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith('https://') || uri.startsWith('http://');
}

async function localUriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Não foi possível ler o ficheiro local (${response.status}).`);
  }
  return response.blob();
}

function audioExtension(uri: string): string {
  const lower = uri.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.wav')) return 'wav';
  if (lower.endsWith('.3gp')) return '3gp';
  if (lower.endsWith('.webm')) return 'webm';
  if (lower.endsWith('.mp3')) return 'mp3';
  if (lower.endsWith('.caf')) return 'caf';
  return 'm4a';
}

/** Envia um anexo (imagem/arquivo) para Firebase Storage. */
export async function uploadChatAttachment(
  uid: string,
  conversationId: string,
  messageId: string,
  attachment: ComposerAttachment,
): Promise<ComposerAttachment> {
  if (!attachment.uri || isRemoteMediaUri(attachment.uri)) return attachment;

  const storage = getLunaStorage();
  if (!storage) throw new Error('Firebase Storage não configurado.');

  const safeName = sanitizeFileName(attachment.name);
  const storagePath = `users/${uid}/conversations/${conversationId}/messages/${messageId}/attachments/${attachment.id}/${safeName}`;
  const storageRef = ref(storage, storagePath);
  const blob = await localUriToBlob(attachment.uri);

  await uploadBytes(storageRef, blob, {
    contentType: attachment.mime || undefined,
    customMetadata: {
      attachmentId: attachment.id,
      kind: attachment.kind,
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return { ...attachment, uri: downloadUrl };
}

/** Envia todos os anexos de uma mensagem. */
export async function uploadChatAttachments(
  uid: string,
  conversationId: string,
  messageId: string,
  attachments: ComposerAttachment[],
): Promise<ComposerAttachment[]> {
  if (attachments.length === 0) return attachments;
  return Promise.all(
    attachments.map((att) => uploadChatAttachment(uid, conversationId, messageId, att)),
  );
}

/** Envia gravação de voz para Firebase Storage. */
export async function uploadVoiceClip(
  uid: string,
  conversationId: string,
  messageId: string,
  clip: VoiceClip,
): Promise<VoiceClip> {
  if (!clip.uri || isRemoteMediaUri(clip.uri)) return clip;

  const storage = getLunaStorage();
  if (!storage) throw new Error('Firebase Storage não configurado.');

  const ext = audioExtension(clip.uri);
  const storagePath = `users/${uid}/conversations/${conversationId}/messages/${messageId}/audio.${ext}`;
  const storageRef = ref(storage, storagePath);
  const blob = await localUriToBlob(clip.uri);

  const mime =
    ext === 'wav'
      ? 'audio/wav'
      : ext === '3gp'
        ? 'audio/3gpp'
        : ext === 'webm'
          ? 'audio/webm'
          : ext === 'mp3'
            ? 'audio/mpeg'
            : 'audio/mp4';

  await uploadBytes(storageRef, blob, { contentType: mime });
  const downloadUrl = await getDownloadURL(storageRef);
  return { uri: downloadUrl, durationMs: clip.durationMs };
}
