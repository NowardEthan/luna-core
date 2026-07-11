import type { ChatMessage } from '../data/fixtures';

function speakerLabel(role: ChatMessage['role']): string {
  return role === 'user' ? 'Você' : 'Luna';
}

/** Texto de uma mensagem para o export — usa transcrição de áudio quando houver. */
function messageBody(msg: ChatMessage): string {
  const text = msg.text?.trim();
  if (text) return text;
  if (msg.audio) return msg.transcript?.trim() || '[mensagem de voz]';
  if (msg.attachments && msg.attachments.length > 0) {
    return `[${msg.attachments.length} anexo${msg.attachments.length === 1 ? '' : 's'}]`;
  }
  return '';
}

/**
 * Formata uma conversa como texto simples e legível para compartilhar via a
 * folha nativa (WhatsApp, e-mail, notas...). Espera `messages` em ordem
 * cronológica (mais antiga primeiro). Ignora bolhas sem conteúdo (ex.: slot de
 * streaming vazio ou falha de rede sem texto).
 */
export function formatConversationForExport(
  title: string,
  messages: ChatMessage[],
  now: Date = new Date(),
): string {
  const stamp = now.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const header = `${title.trim() || 'Conversa'}\nExportado do Orbit · ${stamp}\n${'—'.repeat(24)}`;

  const body = messages
    .filter((m) => !m.streaming)
    .map((m) => {
      const content = messageBody(m);
      if (!content) return null;
      return `${speakerLabel(m.role)}:\n${content}`;
    })
    .filter((block): block is string => block != null)
    .join('\n\n');

  return `${header}\n\n${body}\n`;
}
