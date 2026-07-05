import type { ChatMessage } from '../data/fixtures';
import { attachmentsPreviewLabel, type ComposerAttachment } from './composerAttachmentModel';
import { excerpt, messageCopyText } from './messageActions';

export type MessageReference = {
  kind: 'message';
  messageId: string;
  role: ChatMessage['role'];
  /** Posição 1-based na thread (para a Luna localizar). */
  messageIndex: number;
  excerpt: string;
  fullText: string;
};

export type DocumentReference = {
  kind: 'document';
  messageId: string;
  role: ChatMessage['role'];
  messageIndex: number;
  attachmentId: string;
  attachmentName: string;
  attachmentUri?: string;
  excerpt: string;
  /** Texto completo do documento (contexto para a Luna). */
  fullText: string;
};

export type ThreadReference = MessageReference | DocumentReference;

export function isDocumentReference(ref: ThreadReference): ref is DocumentReference {
  return ref.kind === 'document';
}

export function isMessageReference(ref: ThreadReference): ref is MessageReference {
  return ref.kind === 'message';
}

export function messageIndexInThread(messages: ChatMessage[], messageId: string): number {
  const i = messages.findIndex((m) => m.id === messageId);
  return i === -1 ? 0 : i + 1;
}

export function buildMessageReference(
  message: ChatMessage,
  messages: ChatMessage[],
  excerptText: string,
): MessageReference | null {
  const fullText = messageCopyText(message);
  const trimmed = excerptText.trim();
  if (!trimmed || !fullText) return null;

  return {
    kind: 'message',
    messageId: message.id,
    role: message.role,
    messageIndex: messageIndexInThread(messages, message.id),
    excerpt: trimmed,
    fullText,
  };
}

export function buildDocumentReference(
  sourceMessage: ChatMessage,
  messages: ChatMessage[],
  attachment: ComposerAttachment,
  documentText: string,
  excerptText: string,
): DocumentReference | null {
  const trimmed = excerptText.trim();
  const full = documentText.trim();
  if (!trimmed || !full) return null;

  return {
    kind: 'document',
    messageId: sourceMessage.id,
    role: sourceMessage.role,
    messageIndex: messageIndexInThread(messages, sourceMessage.id),
    attachmentId: attachment.id,
    attachmentName: attachment.name,
    attachmentUri: attachment.uri,
    excerpt: trimmed,
    fullText: full,
  };
}

function escapeCite(text: string): string {
  return text.replace(/"/g, '\\"');
}

/** Monta o prompt enviado à Luna — referência + pergunta do usuário. */
export function formatMessageWithReference(userText: string, ref: ThreadReference): string {
  if (isDocumentReference(ref)) {
    return formatMessageWithDocumentReference(userText, ref);
  }

  const author = ref.role === 'user' ? 'você' : 'Luna';
  const question = userText.trim();
  const cite = escapeCite(ref.excerpt);

  return (
    `[Referência contextual]\n` +
    `- Mensagem #${ref.messageIndex} (${author})\n` +
    `- Trecho citado: "${cite}"\n\n` +
    (question ? `Pergunta sobre este trecho:\n${question}` : `Comentário sobre este trecho.`)
  );
}

export function formatMessageWithDocumentReference(userText: string, ref: DocumentReference): string {
  const author = ref.role === 'user' ? 'você' : 'Luna';
  const question = userText.trim();
  const cite = escapeCite(ref.excerpt);
  const name = escapeCite(ref.attachmentName);

  return (
    `[Referência contextual]\n` +
    `- Documento: "${name}" (mensagem #${ref.messageIndex}, ${author})\n` +
    `- Trecho citado: "${cite}"\n\n` +
    (question ? `Pergunta sobre este trecho:\n${question}` : `Comentário sobre este trecho.`)
  );
}

export function referenceAuthorLabel(ref: Pick<ThreadReference, 'role'>): string {
  return ref.role === 'user' ? 'Sua mensagem' : 'Luna';
}

export function referenceChipLabel(ref: ThreadReference): string {
  if (isDocumentReference(ref)) {
    return `Doc: ${ref.attachmentName} · ${excerpt(ref.excerpt, 40)}`;
  }
  return `${referenceAuthorLabel(ref)} #${ref.messageIndex} · ${excerpt(ref.excerpt, 48)}`;
}

export function feedbackForReference(ref: ThreadReference): {
  id: string;
  kind: 'reference';
  role: 'user';
  title: string;
  detail: string;
} {
  if (isDocumentReference(ref)) {
    return {
      id: `ref-doc-${Date.now()}`,
      kind: 'reference',
      role: 'user',
      title: 'Trecho do documento referenciado',
      detail: `${ref.attachmentName} anexado ao composer. Escreva sua pergunta e envie.`,
    };
  }
  return {
    id: `ref-${Date.now()}`,
    kind: 'reference',
    role: 'user',
    title: 'Trecho referenciado',
    detail: `Mensagem #${ref.messageIndex} anexada ao composer. Escreva sua pergunta e envie.`,
  };
}

export type ParsedMessageReferencePrompt = {
  kind: 'message';
  messageIndex: number;
  role: ChatMessage['role'];
  excerpt: string;
  userText: string;
};

export type ParsedDocumentReferencePrompt = {
  kind: 'document';
  messageIndex: number;
  role: ChatMessage['role'];
  attachmentName: string;
  excerpt: string;
  userText: string;
};

export type ParsedReferencePrompt = ParsedMessageReferencePrompt | ParsedDocumentReferencePrompt;

/** Detecta prompt legado gravado no Firestore (texto completo enviado à API). */
export function parseReferencePrompt(text: string | undefined): ParsedReferencePrompt | null {
  const t = text?.trim();
  if (!t?.startsWith('[Referência contextual]')) return null;

  const docMatch = t.match(
    /- Documento: "((?:\\.|[^"\\])*)" \(mensagem #(\d+), (você|Luna)\)/,
  );
  const citeMatch = t.match(/- Trecho citado: "((?:\\.|[^"\\])*)"/);
  if (!citeMatch) return null;

  const excerptText = citeMatch[1].replace(/\\"/g, '"').trim();
  if (!excerptText) return null;

  const questionMatch = t.match(/Pergunta sobre este trecho:\n([\s\S]*)$/);
  const userText = questionMatch ? questionMatch[1].trim() : '';

  if (docMatch) {
    const messageIndex = Number.parseInt(docMatch[2], 10);
    if (!Number.isFinite(messageIndex) || messageIndex < 1) return null;
    return {
      kind: 'document',
      messageIndex,
      role: docMatch[3] === 'você' ? 'user' : 'luna',
      attachmentName: docMatch[1].replace(/\\"/g, '"').trim(),
      excerpt: excerptText,
      userText,
    };
  }

  const indexMatch = t.match(/- Mensagem #(\d+) \((você|Luna)\)/);
  if (!indexMatch) return null;

  const messageIndex = Number.parseInt(indexMatch[1], 10);
  if (!Number.isFinite(messageIndex) || messageIndex < 1) return null;

  return {
    kind: 'message',
    messageIndex,
    role: indexMatch[2] === 'você' ? 'user' : 'luna',
    excerpt: excerptText,
    userText,
  };
}

export function resolveMessageReference(
  parsed: ParsedMessageReferencePrompt,
  messages: ChatMessage[],
): MessageReference {
  const target = messages[parsed.messageIndex - 1];
  return {
    kind: 'message',
    messageId: target?.id ?? `ref-${parsed.messageIndex}`,
    role: parsed.role,
    messageIndex: parsed.messageIndex,
    excerpt: parsed.excerpt,
    fullText: target ? messageCopyText(target) : parsed.excerpt,
  };
}

export function resolveDocumentReference(
  parsed: ParsedDocumentReferencePrompt,
  messages: ChatMessage[],
): DocumentReference {
  const target = messages[parsed.messageIndex - 1];
  const attachment =
    target?.attachments?.find((a) => a.name === parsed.attachmentName) ??
    target?.attachments?.find((a) => a.kind === 'file');

  return {
    kind: 'document',
    messageId: target?.id ?? `ref-${parsed.messageIndex}`,
    role: parsed.role,
    messageIndex: parsed.messageIndex,
    attachmentId: attachment?.id ?? `att-ref-${parsed.messageIndex}`,
    attachmentName: parsed.attachmentName,
    attachmentUri: attachment?.uri,
    excerpt: parsed.excerpt,
    fullText: parsed.excerpt,
  };
}

export function resolveReferencePrompt(
  parsed: ParsedReferencePrompt,
  messages: ChatMessage[],
): ThreadReference {
  if (parsed.kind === 'document') {
    return resolveDocumentReference(parsed, messages);
  }
  return resolveMessageReference(parsed, messages);
}

function stripAttachmentFallbackText(message: ChatMessage): ChatMessage {
  const text = message.text?.trim();
  if (!text || !message.attachments?.length) return message;
  const fallback = attachmentsPreviewLabel(message.attachments);
  if (text !== fallback) return message;
  return { ...message, text: undefined };
}

/** Separa cartão de referência + pergunta (inclui mensagens legadas). */
export function normalizeMessageForDisplay(
  message: ChatMessage,
  messages: ChatMessage[],
): ChatMessage {
  let normalized: ChatMessage;

  if (message.reference) {
    const parsed = parseReferencePrompt(message.text);
    normalized = parsed
      ? { ...message, text: parsed.userText || undefined }
      : message;
  } else {
    const parsed = parseReferencePrompt(message.text);
    normalized = parsed
      ? {
          ...message,
          text: parsed.userText || undefined,
          reference: resolveReferencePrompt(parsed, messages),
        }
      : message;
  }

  return stripAttachmentFallbackText(normalized);
}

/** @deprecated Use normalizeMessageForDisplay */
export function normalizeUserMessageForDisplay(
  message: ChatMessage,
  messages: ChatMessage[],
): ChatMessage {
  if (message.role !== 'user') return message;
  return normalizeMessageForDisplay(message, messages);
}

export function normalizeMessagesForDisplay(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => normalizeMessageForDisplay(m, messages));
}

export function referencePreviewText(ref: ThreadReference, userText?: string): string {
  const q = userText?.trim();
  if (q) return q;
  if (isDocumentReference(ref)) {
    return `${ref.attachmentName} · ${excerpt(ref.excerpt, 40)}`;
  }
  return `${referenceAuthorLabel(ref)} #${ref.messageIndex} · ${excerpt(ref.excerpt, 40)}`;
}

export function findAttachmentForReference(
  messages: ChatMessage[],
  ref: DocumentReference,
): ComposerAttachment | null {
  const message = messages.find((m) => m.id === ref.messageId);
  if (!message?.attachments?.length) return null;
  return (
    message.attachments.find((a) => a.id === ref.attachmentId) ??
    message.attachments.find((a) => a.name === ref.attachmentName && a.kind === 'file') ??
    null
  );
}
