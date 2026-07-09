import type { SessionItem } from '../../data/fixtures';
import type { ConversationFolder } from './types';
import { ORGANIZE_COPY } from './copy';
import { getFolderAncestorIds } from './folderTree';

export type ExplorerBreadcrumb = { id: string | null; label: string };

export type ExplorerView = {
  folders: ConversationFolder[];
  chats: SessionItem[];
};

function sortFolders(list: ConversationFolder[]): ConversationFolder[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

function resolveParentId(folder: ConversationFolder, validIds: Set<string>): string | null {
  const raw = folder.parentId ?? null;
  if (!raw || !validIds.has(raw) || raw === folder.id) return null;
  return raw;
}

export function getChildFolders(
  parentId: string | null,
  folders: ConversationFolder[],
): ConversationFolder[] {
  const validIds = new Set(folders.map((f) => f.id));
  return sortFolders(
    folders.filter((f) => resolveParentId(f, validIds) === parentId),
  );
}

/** Mantém ordem da lista de entrada (já ordenada por updatedAt no Firestore). */
function preserveOrder(sessions: SessionItem[], ids: Set<string>): SessionItem[] {
  return sessions.filter((s) => ids.has(s.id));
}

export function pinnedSessions(sessions: SessionItem[]): SessionItem[] {
  return sessions.filter((s) => s.pinned);
}

export function buildExplorerView(
  folderId: string | null,
  sessions: SessionItem[],
  folders: ConversationFolder[],
): ExplorerView {
  const validIds = new Set(folders.map((f) => f.id));
  const childFolders = getChildFolders(folderId, folders);
  const unpinned = sessions.filter((s) => !s.pinned);

  if (folderId === null) {
    const looseIds = new Set(
      unpinned
        .filter((s) => !s.collectionId || !validIds.has(s.collectionId))
        .map((s) => s.id),
    );
    return { folders: childFolders, chats: preserveOrder(unpinned, looseIds) };
  }

  const inFolderIds = new Set(
    unpinned.filter((s) => s.collectionId === folderId).map((s) => s.id),
  );
  return { folders: childFolders, chats: preserveOrder(unpinned, inFolderIds) };
}

export function buildExplorerBreadcrumb(
  folderId: string | null,
  folders: ConversationFolder[],
): ExplorerBreadcrumb[] {
  const segments: ExplorerBreadcrumb[] = [{ id: null, label: ORGANIZE_COPY.explorerRoot }];
  if (!folderId) return segments;

  for (const id of getFolderAncestorIds(folderId, folders)) {
    const match = folders.find((f) => f.id === id);
    if (match) segments.push({ id: match.id, label: match.name });
  }
  return segments;
}

export function folderRowMeta(
  folder: ConversationFolder,
  folders: ConversationFolder[],
  sessions: SessionItem[],
): string {
  const chatCount = sessions.filter((s) => s.collectionId === folder.id && !s.pinned).length;
  const subfolderCount = getChildFolders(folder.id, folders).length;
  const parts: string[] = [];

  if (chatCount > 0) {
    parts.push(
      chatCount === 1
        ? ORGANIZE_COPY.explorerChatCountOne
        : ORGANIZE_COPY.explorerChatCountMany.replace('{count}', String(chatCount)),
    );
  }
  if (subfolderCount > 0) {
    parts.push(
      subfolderCount === 1
        ? ORGANIZE_COPY.explorerFolderCountOne
        : ORGANIZE_COPY.explorerFolderCountMany.replace('{count}', String(subfolderCount)),
    );
  }
  if (parts.length === 0) return ORGANIZE_COPY.explorerFolderEmpty;
  return parts.join(' · ');
}

export function parentFolderId(
  folderId: string | null,
  folders: ConversationFolder[],
): string | null {
  if (!folderId) return null;
  const validIds = new Set(folders.map((f) => f.id));
  const match = folders.find((f) => f.id === folderId);
  if (!match) return null;
  return resolveParentId(match, validIds);
}
