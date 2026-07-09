export function newMessageId(prefix: 'u' | 'l'): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
