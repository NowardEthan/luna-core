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
 * Formata uma conversa como **Markdown** para exportar como arquivo `.md`
 * (importável em Obsidian, Notion, etc.) ou compartilhar como texto. Espera
 * `messages` em ordem cronológica (mais antiga primeiro). Ignora bolhas sem
 * conteúdo (ex.: slot de streaming vazio ou falha de rede sem texto).
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

  const header = `# ${title.trim() || 'Conversa'}\n\n*Exportado do Orbit · ${stamp}*\n\n---`;

  const body = messages
    .filter((m) => !m.streaming)
    .map((m) => {
      const content = messageBody(m);
      if (!content) return null;
      return `**${speakerLabel(m.role)}:**\n\n${content}`;
    })
    .filter((block): block is string => block != null)
    .join('\n\n');

  return `${header}\n\n${body}\n`;
}

/** Nome-base seguro (sem extensão) para o arquivo exportado, derivado do título. */
export function exportFileBaseName(title: string): string {
  const clean = (title.trim() || 'conversa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return clean || 'conversa';
}
