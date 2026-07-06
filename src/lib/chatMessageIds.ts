/** Par estável: um userMessageId → um lunaMessageId (retry de rede não duplica). */
export function lunaMessageIdForUser(userMessageId: string): string {
  if (userMessageId.startsWith('u')) {
    return `l${userMessageId.slice(1)}`;
  }
  return `l-${userMessageId}`;
}
