export type ConversationDropTarget =
  | { kind: 'root' }
  | { kind: 'folder'; folderId: string };

export type DropZoneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DragGhost = {
  x: number;
  y: number;
  title: string;
};

export const DRAG_THRESHOLD_PX = 8;

export function dropTargetsEqual(
  a: ConversationDropTarget | null,
  b: ConversationDropTarget | null,
): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'root' && b.kind === 'root') return true;
  if (a.kind === 'folder' && b.kind === 'folder') return a.folderId === b.folderId;
  return false;
}

export function dropTargetToCollectionId(target: ConversationDropTarget): string | null {
  return target.kind === 'root' ? null : target.folderId;
}

export function hitTestDropZones(
  x: number,
  y: number,
  zones: Map<string, { target: ConversationDropTarget; rect: DropZoneRect }>,
): ConversationDropTarget | null {
  let best: ConversationDropTarget | null = null;
  let bestArea = Infinity;

  for (const { target, rect } of zones.values()) {
    if (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    ) {
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = target;
      }
    }
  }

  return best;
}
