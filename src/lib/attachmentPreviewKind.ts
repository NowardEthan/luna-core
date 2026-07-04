import type { ComposerAttachment } from './composerAttachmentModel';
import { fileExtension } from './readableDocuments';

export type AttachmentPreviewKind =
  | 'pdf'
  | 'html'
  | 'markdown'
  | 'code'
  | 'document'
  | 'unsupported';

export type AttachmentPreviewResult = {
  kind: AttachmentPreviewKind;
  /** Texto ou HTML — vazio quando o preview usa URI directo (PDF). */
  content: string;
  /** URI para WebView (PDF ou HTML remoto). */
  sourceUri?: string;
  language?: string | null;
  truncated?: boolean;
  /** Preview em texto porque WebView nativo não está no build. */
  fallbackNote?: 'pdf-text' | 'html-text';
};

const CODE_EXTENSIONS = new Set(['json', 'xml', 'yaml', 'yml', 'log', 'csv', 'ts', 'tsx', 'js', 'jsx', 'py', 'sql']);

function languageFromExtension(ext: string): string | null {
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  if (ext === 'csv') return 'csv';
  if (ext === 'sql') return 'sql';
  if (ext === 'py') return 'python';
  if (ext === 'tsx') return 'tsx';
  if (ext === 'ts') return 'typescript';
  if (ext === 'jsx') return 'jsx';
  if (ext === 'js') return 'javascript';
  if (ext === 'log') return 'log';
  return ext || null;
}

export function attachmentPreviewKind(att: ComposerAttachment): AttachmentPreviewKind {
  if (att.kind !== 'file' || !att.uri) return 'unsupported';

  const ext = fileExtension(att.name);
  const mime = att.mime.toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext && CODE_EXTENSIONS.has(ext)) return 'code';
  if (ext === 'txt' || mime.startsWith('text/')) return 'document';
  if (
    ext === 'docx' ||
    ext === 'doc' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    return 'document';
  }
  if (mime === 'application/json' || mime === 'application/xml') return 'code';

  return 'unsupported';
}

export function previewLanguage(att: ComposerAttachment): string | null {
  const ext = fileExtension(att.name);
  return languageFromExtension(ext);
}

export function canPreviewAttachment(att: ComposerAttachment): boolean {
  return att.kind === 'file' && !!att.uri && attachmentPreviewKind(att) !== 'unsupported';
}
