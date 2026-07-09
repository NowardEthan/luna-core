import type { ConversationFolder } from './types';
import { MAX_FOLDER_DEPTH } from './types';

export type FolderTreeNode = ConversationFolder & { children: FolderTreeNode[] };

function sortFolders(list: ConversationFolder[]): ConversationFolder[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export function buildFolderTree(folders: ConversationFolder[]): FolderTreeNode[] {
  const ids = new Set(folders.map((f) => f.id));
  const byParent = new Map<string | null, ConversationFolder[]>();

  for (const folder of folders) {
    const rawParent = folder.parentId ?? null;
    const parentId =
      rawParent && ids.has(rawParent) && rawParent !== folder.id ? rawParent : null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push({ ...folder, parentId });
  }

  function build(parentId: string | null): FolderTreeNode[] {
    return sortFolders(byParent.get(parentId) ?? []).map((folder) => ({
      ...folder,
      children: build(folder.id),
    }));
  }

  return build(null);
}

export function getFolderAncestorIds(
  folderId: string,
  folders: ConversationFolder[],
): string[] {
  const ids: string[] = [];
  let current: string | null = folderId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    ids.unshift(current);
    const parent = folders.find((f) => f.id === current)?.parentId ?? null;
    current = parent;
  }
  return ids;
}

export function getFolderDescendantIds(
  folderId: string,
  folders: ConversationFolder[],
): Set<string> {
  const tree = buildFolderTree(folders);
  const out = new Set<string>();

  function walk(nodes: FolderTreeNode[]) {
    for (const node of nodes) {
      if (node.id === folderId || out.has(node.id)) {
        collect(node);
        continue;
      }
      walk(node.children);
    }
  }

  function collect(node: FolderTreeNode) {
    out.add(node.id);
    for (const child of node.children) collect(child);
  }

  const root = tree.find((n) => n.id === folderId);
  if (root) collect(root);
  else walk(tree);
  return out;
}

export function folderDepth(folderId: string, folders: ConversationFolder[]): number {
  return getFolderAncestorIds(folderId, folders).length;
}

export function canNestFolderUnder(
  parentId: string | null,
  folders: ConversationFolder[],
): boolean {
  if (!parentId) return true;
  return folderDepth(parentId, folders) < MAX_FOLDER_DEPTH;
}

export function flattenFoldersForSelect(
  tree: FolderTreeNode[],
  depth = 0,
): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  for (const node of tree) {
    out.push({ id: node.id, label: node.name, depth });
    out.push(...flattenFoldersForSelect(node.children, depth + 1));
  }
  return out;
}
