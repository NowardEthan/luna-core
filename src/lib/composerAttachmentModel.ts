export type ComposerAttachmentKind = 'image' | 'file';

export type ComposerAttachment = {
  id: string;
  kind: ComposerAttachmentKind;
  name: string;
  size: number;
  mime: string;
  /** URI local (file://) — disponível na sessão; não persiste na nuvem. */
  uri?: string;
};

export type ComposerSendPayload = {
  text: string;
  attachments: ComposerAttachment[];
};

const IMAGE_MIME = /^image\//;

export function attachmentKindFromMime(mime: string): ComposerAttachmentKind {
  return IMAGE_MIME.test(mime) ? 'image' : 'file';
}

export function newAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'file';
  return name.slice(dot + 1).slice(0, 4).toLowerCase();
}

export function formatAttachmentsForApi(attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map((a) => {
    const label = a.kind === 'image' ? 'Imagem' : 'Arquivo';
    return `- ${label}: ${a.name} (${formatAttachmentSize(a.size)})`;
  });
  return `[Anexos]\n${lines.join('\n')}`;
}

/** Enriquecimento de anexos antes do chat (visão + texto de documentos). */
export type LunaAttachmentEnrichment = {
  visionByUri?: Readonly<Record<string, string>>;
  textByUri?: Readonly<Record<string, string>>;
};

/** Texto máximo de cada arquivo no prompt enviado à Luna (Groq ~8k TPM). */
const MAX_LUNA_ATTACHMENT_CHARS = 2_000;

const LUNA_DOC_TRUNCATE_NOTICE =
  '\n\n[… parte omitida — arquivo longo; referencie um trecho ou pergunte sobre uma seção …]';

function truncateTextForLunaApi(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MAX_LUNA_ATTACHMENT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_LUNA_ATTACHMENT_CHARS)}${LUNA_DOC_TRUNCATE_NOTICE}`;
}

/** Monta texto para a Luna com descrições visuais e conteúdo de arquivos. */
export function formatAttachmentsForLunaApi(
  attachments: ComposerAttachment[],
  enrich: LunaAttachmentEnrichment,
  userText = '',
): string {
  if (attachments.length === 0) return userText.trim();

  const lines: string[] = [];
  for (const att of attachments) {
    const label = att.kind === 'image' ? 'Imagem' : 'Arquivo';
    lines.push(`- ${label}: ${att.name} (${formatAttachmentSize(att.size)})`);
    if (att.kind === 'image' && att.uri) {
      const description = enrich.visionByUri?.[att.uri];
      if (description) {
        lines.push(`  Conteúdo visual: ${truncateTextForLunaApi(description)}`);
      }
    }
    if (att.kind === 'file' && att.uri) {
      const text = enrich.textByUri?.[att.uri];
      if (text) {
        const clipped = truncateTextForLunaApi(text);
        const indented = clipped
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n');
        lines.push(`  Conteúdo do arquivo:\n${indented}`);
      }
    }
  }

  const block = `[Anexos]\n${lines.join('\n')}`;
  const trimmed = userText.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function attachmentsPreviewLabel(attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return '';
  if (attachments.length === 1) return attachments[0].name;
  const images = attachments.filter((a) => a.kind === 'image').length;
  const files = attachments.length - images;
  const parts: string[] = [];
  if (images > 0) parts.push(`${images} imagem${images === 1 ? '' : 'ns'}`);
  if (files > 0) parts.push(`${files} arquivo${files === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function attachmentsEqual(a?: ComposerAttachment[], b?: ComposerAttachment[]): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((item, i) => {
    const other = right[i];
    return (
      item.id === other.id &&
      item.kind === other.kind &&
      item.name === other.name &&
      item.size === other.size &&
      item.mime === other.mime &&
      item.uri === other.uri
    );
  });
}
