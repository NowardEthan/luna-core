import type { ChatMessage } from '../../data/fixtures';

/** Heurística — respostas Luna com fences, listas, headings, etc. */
export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/```[\s\S]*?```/.test(t)) return true;
  if (/^#{1,4}\s/m.test(t)) return true;
  if (/^\s*[-*+]\s/m.test(t)) return true;
  if (/^\s*\d+\.\s/m.test(t)) return true;
  if (/\*\*[^*\n]+\*\*/.test(t)) return true;
  if (/^>\s/m.test(t)) return true;
  if (/^\|.+\|/m.test(t)) return true;
  if (/`[^`\n]+`/.test(t)) return true;
  return false;
}

export function shouldRenderMarkdown(message: ChatMessage): boolean {
  if (message.format === 'markdown') return true;
  if (message.format === 'plain') return false;
  if (!message.text?.trim()) return false;
  if (message.role === 'luna') return looksLikeMarkdown(message.text);
  return false;
}
