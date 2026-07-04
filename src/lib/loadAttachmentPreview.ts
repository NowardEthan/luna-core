import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

import {
  attachmentPreviewKind,
  previewLanguage,
  type AttachmentPreviewResult,
} from './attachmentPreviewKind';
import type { ComposerAttachment } from './composerAttachmentModel';
import { isRemoteMediaUri } from './firebase/uploadChatMedia';
import { fileExtension, isReadableDocumentAttachment } from './readableDocuments';
import { htmlToPlainText } from './htmlToPlainText';
import { isWebViewNativeAvailable } from './optionalWebView';
import { extractDocumentAttachmentsSafe } from '../data/extractDocumentAttachments';

const previewCache = new Map<string, AttachmentPreviewResult>();

function cacheKey(att: ComposerAttachment): string {
  return `${att.uri ?? att.id}:${att.name}`;
}

async function readUriText(uri: string): Promise<string> {
  if (isRemoteMediaUri(uri)) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Não foi possível carregar o arquivo.');
    return response.text();
  }
  try {
    return await new File(uri).text();
  } catch {
    return readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
  }
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function prepareTextContent(kind: AttachmentPreviewResult['kind'], raw: string, att: ComposerAttachment): string {
  if (kind === 'code' && fileExtension(att.name) === 'json') {
    return formatJson(raw);
  }
  return raw.replace(/\r\n/g, '\n');
}

async function loadExtractedDocument(
  att: ComposerAttachment,
  getIdToken?: () => Promise<string | null>,
): Promise<AttachmentPreviewResult> {
  const textMap = await extractDocumentAttachmentsSafe([att], { getIdToken });
  const text = att.uri ? textMap[att.uri]?.trim() : '';
  if (!text) {
    throw new Error('Não foi possível extrair o conteúdo deste arquivo.');
  }
  return {
    kind: 'document',
    content: text,
    truncated: text.includes('[... conteúdo truncado'),
  };
}

/** Carrega conteúdo para pré-visualização (com cache em memória). */
export async function loadAttachmentPreview(
  att: ComposerAttachment,
  options: { getIdToken?: () => Promise<string | null>; force?: boolean } = {},
): Promise<AttachmentPreviewResult> {
  const key = cacheKey(att);
  if (!options.force && previewCache.has(key)) {
    return previewCache.get(key)!;
  }

  if (!att.uri) throw new Error('Arquivo indisponível nesta sessão.');

  const kind = attachmentPreviewKind(att);

  if (kind === 'unsupported') {
    throw new Error('Este tipo de arquivo não pode ser visualizado no app.');
  }

  if (kind === 'pdf') {
    if (isWebViewNativeAvailable()) {
      const result: AttachmentPreviewResult = {
        kind: 'pdf',
        content: '',
        sourceUri: att.uri,
      };
      previewCache.set(key, result);
      return result;
    }
    const result = await loadExtractedDocument(att, options.getIdToken);
    previewCache.set(key, { ...result, fallbackNote: 'pdf-text' });
    return previewCache.get(key)!;
  }

  if (kind === 'html') {
    const raw = await readUriText(att.uri);
    if (isWebViewNativeAvailable()) {
      const result: AttachmentPreviewResult = { kind: 'html', content: raw };
      previewCache.set(key, result);
      return result;
    }
    const result: AttachmentPreviewResult = {
      kind: 'document',
      content: htmlToPlainText(raw),
      fallbackNote: 'html-text',
    };
    previewCache.set(key, result);
    return result;
  }

  const needsExtract =
    kind === 'document' &&
    (['docx', 'doc'].includes(fileExtension(att.name)) ||
      att.mime.includes('wordprocessingml') ||
      att.mime === 'application/msword') &&
    !canReadLocally(att);

  if (needsExtract) {
    const result = await loadExtractedDocument(att, options.getIdToken);
    previewCache.set(key, result);
    return result;
  }

  const raw = await readUriText(att.uri);
  const content = prepareTextContent(kind, raw, att);

  const result: AttachmentPreviewResult = {
    kind,
    content,
    language: kind === 'code' ? previewLanguage(att) : null,
  };

  previewCache.set(key, result);
  return result;
}

function canReadLocally(att: ComposerAttachment): boolean {
  const ext = fileExtension(att.name);
  if (['txt', 'md', 'markdown', 'json', 'csv', 'html', 'htm', 'xml', 'yaml', 'yml', 'log'].includes(ext)) {
    return true;
  }
  if (att.mime.startsWith('text/') || att.mime === 'application/json' || att.mime === 'application/xml') {
    return true;
  }
  return isReadableDocumentAttachment(att) && ext !== 'pdf' && ext !== 'docx' && ext !== 'doc';
}

export function clearAttachmentPreviewCache(): void {
  previewCache.clear();
}
