/** Normaliza linguagem de fences markdown (igual Orbit concept). */
export function normalizeCodeLanguage(className?: string): string | null {
  const match = /language-([\w-]+)/.exec(className ?? '');
  if (!match) return null;
  const lang = match[1].toLowerCase();
  if (lang === 'js') return 'javascript';
  if (lang === 'ts') return 'typescript';
  if (lang === 'sh') return 'bash';
  return lang;
}

export const COLLAPSE_LINE_THRESHOLD = 8;
export const PREVIEW_LINES = 4;
