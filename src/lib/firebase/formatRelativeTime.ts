/** Formata timestamp para rótulo curto na lista de conversas. */
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'ontem';
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
