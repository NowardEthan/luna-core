import { File } from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { isReadableDocumentAttachment } from '../lib/readableDocuments';
import { LunaApiError, lunaExtractDocuments } from './lunaClient';

export async function readAttachmentBase64(uri: string): Promise<string> {
  try {
    return await new File(uri).base64();
  } catch {
    return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  }
}

/** Envia documentos à Luna API (/v1/extract-documents) e devolve texto por URI. */
export async function extractDocumentAttachments(
  files: ComposerAttachment[],
  options: {
    getIdToken?: () => Promise<string | null>;
  } = {},
): Promise<Record<string, string>> {
  const readable = files.filter((f) => f.kind === 'file' && f.uri && isReadableDocumentAttachment(f));
  if (readable.length === 0) return {};

  const payloadFiles = await Promise.all(
    readable.map(async (file) => ({
      fileBase64: await readAttachmentBase64(file.uri!),
      mimeType: file.mime || 'application/octet-stream',
      name: file.name,
    })),
  );

  const idToken = options.getIdToken ? await options.getIdToken() : null;
  const documents = await lunaExtractDocuments({ files: payloadFiles, idToken });

  const map: Record<string, string> = {};
  readable.forEach((file, index) => {
    const text = documents[index]?.text?.trim();
    if (file.uri && text) map[file.uri] = text;
  });
  return map;
}

export async function extractDocumentAttachmentsSafe(
  files: ComposerAttachment[],
  options: Parameters<typeof extractDocumentAttachments>[1] = {},
): Promise<Record<string, string>> {
  try {
    return await extractDocumentAttachments(files, options);
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    throw new LunaApiError(
      err instanceof Error ? err.message : 'Não consegui ler o arquivo anexado.',
    );
  }
}
