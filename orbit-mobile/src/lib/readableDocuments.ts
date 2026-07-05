import type { ComposerAttachment } from './composerAttachmentModel';

/** Extensões que a Luna consegue ler (texto extraído antes do chat). */
export const READABLE_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'md',
  'markdown',
  'txt',
  'json',
  'csv',
  'html',
  'htm',
  'xml',
  'log',
  'yaml',
  'yml',
]);

/** Extensões mostradas na aba Arquivo (anexo como documento, não imagem). */
export const DOCUMENT_ATTACHMENT_EXTENSIONS = new Set([
  ...READABLE_DOCUMENT_EXTENSIONS,
  'doc',
  'rtf',
  'odt',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'epub',
  'zip',
]);

const MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
  'bmp',
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  '3gp',
]);

const READABLE_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];

const READABLE_MIME_EXACT = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function isReadableDocumentAttachment(att: ComposerAttachment): boolean {
  if (att.kind !== 'file' || !att.uri) return false;

  const ext = fileExtension(att.name);
  if (ext && READABLE_DOCUMENT_EXTENSIONS.has(ext)) return true;

  const mime = att.mime.toLowerCase();
  if (READABLE_MIME_EXACT.has(mime)) return true;
  return READABLE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export function readableDocumentLabel(att: ComposerAttachment): string {
  const ext = fileExtension(att.name);
  return ext ? ext.toUpperCase() : 'DOC';
}

export function isMediaFileName(name: string): boolean {
  const ext = fileExtension(name);
  return ext ? MEDIA_EXTENSIONS.has(ext) : false;
}

/** Ficheiro adequado à aba Arquivo (PDF, DOCX, MD… — não fotos/vídeos). */
export function isDocumentAttachmentName(name: string): boolean {
  const ext = fileExtension(name);
  if (!ext) return false;
  if (MEDIA_EXTENSIONS.has(ext)) return false;
  return DOCUMENT_ATTACHMENT_EXTENSIONS.has(ext);
}

export function isDocumentComposerAttachment(att: ComposerAttachment): boolean {
  if (att.kind !== 'file') return false;
  if (isDocumentAttachmentName(att.name)) return true;
  const mime = att.mime.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) {
    return false;
  }
  return READABLE_MIME_EXACT.has(mime) || READABLE_MIME_PREFIXES.some((p) => mime.startsWith(p));
}
