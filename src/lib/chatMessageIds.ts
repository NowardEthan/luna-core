/** Par estável: um userMessageId → um lunaMessageId (retry de rede não duplica). */
export function lunaMessageIdForUser(userMessageId: string): string {
  if (userMessageId.startsWith('u')) {
    return `l${userMessageId.slice(1)}`;
  }
  return `l-${userMessageId}`;
}

/** Inverso de lunaMessageIdForUser — null se o id não seguir o par estável. */
export function userMessageIdForLuna(lunaMessageId: string): string | null {
  if (lunaMessageId.startsWith('l') && !lunaMessageId.startsWith('l-')) {
    return `u${lunaMessageId.slice(1)}`;
  }
  if (lunaMessageId.startsWith('l-')) {
    const rest = lunaMessageId.slice(2);
    return rest.startsWith('u') ? rest : null;
  }
  return null;
}
