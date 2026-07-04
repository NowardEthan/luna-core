import type { ComposerAttachment } from '../lib/composerAttachmentModel';
import { LunaApiError, lunaVisionDescribe } from './lunaClient';
import { readAttachmentBase64 } from './extractDocumentAttachments';

/** Envia imagens à Luna API (/v1/vision) e devolve descrições por URI. */
export async function describeImageAttachments(
  images: ComposerAttachment[],
  options: {
    userPrompt?: string;
    getIdToken?: () => Promise<string | null>;
  } = {},
): Promise<Record<string, string>> {
  const withUri = images.filter((img) => img.kind === 'image' && img.uri);
  if (withUri.length === 0) return {};

  const payloadImages = await Promise.all(
    withUri.map(async (img) => ({
      imageBase64: await readAttachmentBase64(img.uri!),
      mimeType: img.mime || 'image/jpeg',
      name: img.name,
    })),
  );

  const idToken = options.getIdToken ? await options.getIdToken() : null;
  const descriptions = await lunaVisionDescribe({
    images: payloadImages,
    userPrompt: options.userPrompt,
    idToken,
  });

  const map: Record<string, string> = {};
  withUri.forEach((img, index) => {
    const text = descriptions[index]?.description?.trim();
    if (img.uri && text) map[img.uri] = text;
  });
  return map;
}

export async function describeImageAttachmentsSafe(
  images: ComposerAttachment[],
  options: Parameters<typeof describeImageAttachments>[1] = {},
): Promise<Record<string, string>> {
  try {
    return await describeImageAttachments(images, options);
  } catch (err) {
    if (err instanceof LunaApiError) throw err;
    throw new LunaApiError(
      err instanceof Error ? err.message : 'Não consegui analisar a imagem anexada.',
    );
  }
}
