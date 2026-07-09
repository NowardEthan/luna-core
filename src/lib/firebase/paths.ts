/** Caminhos Firestore — alinhados com `orbit-legacy/firestore.rules`. */

export const LUNA_FS = {
  users: 'users',
  conversations: 'conversations',
  collections: 'collections',
  conversationsTrash: 'conversations_trash',
  rosaryDays: 'rosary_days',
} as const;

export function userDoc(uid: string): string {
  return `${LUNA_FS.users}/${uid}`;
}

export function userConversationDoc(uid: string, conversationId: string): string {
  return `${userDoc(uid)}/${LUNA_FS.conversations}/${conversationId}`;
}

export function userCollectionsCol(uid: string): string {
  return `${userDoc(uid)}/${LUNA_FS.collections}`;
}

export function userCollectionDoc(uid: string, collectionId: string): string {
  return `${userCollectionsCol(uid)}/${collectionId}`;
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

/** Uso mensal de mensagens na nuvem (billing). */
export function userUsageDoc(uid: string, monthKey: string): string {
  return `${userDoc(uid)}/usage/${monthKey}`;
}

export function userRosaryDayDoc(uid: string, dateKey: string): string {
  return `${userDoc(uid)}/${LUNA_FS.rosaryDays}/${dateKey}`;
}

export function userRosaryDaysCol(uid: string): string {
  return `${userDoc(uid)}/${LUNA_FS.rosaryDays}`;
}
