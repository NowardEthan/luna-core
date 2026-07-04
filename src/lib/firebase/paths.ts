/** Caminhos Firestore — alinhados com `orbit-legacy/firestore.rules`. */

export const LUNA_FS = {
  users: 'users',
  conversations: 'conversations',
  conversationsTrash: 'conversations_trash',
} as const;

export function userDoc(uid: string): string {
  return `${LUNA_FS.users}/${uid}`;
}

export function userConversationDoc(uid: string, conversationId: string): string {
  return `${userDoc(uid)}/${LUNA_FS.conversations}/${conversationId}`;
}

export function userConversationMessagesCol(uid: string, conversationId: string): string {
  return `${userConversationDoc(uid, conversationId)}/messages`;
}

export function userConversationTrashCol(uid: string): string {
  return `${userDoc(uid)}/${LUNA_FS.conversationsTrash}`;
}

export function userConversationTrashDoc(uid: string, conversationId: string): string {
  return `${userConversationTrashCol(uid)}/${conversationId}`;
}

export function userConversationTrashMessagesCol(uid: string, conversationId: string): string {
  return `${userConversationTrashDoc(uid, conversationId)}/messages`;
}

/** Lixeira por mensagem dentro de uma conversa ativa. */
export function userMessageTrashCol(uid: string, conversationId: string): string {
  return `${userConversationDoc(uid, conversationId)}/messages_trash`;
}
