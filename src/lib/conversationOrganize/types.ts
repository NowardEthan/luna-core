/** Pasta de organização de conversas (espelha SidebarCollection do Orbit concept). */
export type ConversationFolder = {
  id: string;
  name: string;
  parentId?: string | null;
};

export const MAX_FOLDER_DEPTH = 6;
