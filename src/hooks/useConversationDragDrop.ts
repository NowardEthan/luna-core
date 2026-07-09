import { useCallback, useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance } from 'react-native';

import {
  DRAG_THRESHOLD_PX,
  dropTargetToCollectionId,
  dropTargetsEqual,
  hitTestDropZones,
  type ConversationDropTarget,
  type DragGhost,
  type DropZoneRect,
} from '../lib/conversationOrganize/conversationDragDrop';
import { hapticLongPress, hapticSuccess } from '../lib/haptics';

type PendingDrag = {
  sessionId: string;
  title: string;
  startX: number;
  startY: number;
};

export function useConversationDragDrop({
  enabled,
  onMove,
  getCollectionId,
}: {
  enabled: boolean;
  onMove: (sessionId: string, collectionId: string | null) => void;
  getCollectionId: (sessionId: string) => string | null | undefined;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ConversationDropTarget | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [remeasureKey, setRemeasureKey] = useState(0);

  const zonesRef = useRef(new Map<string, { target: ConversationDropTarget; rect: DropZoneRect }>());
  const pendingRef = useRef<PendingDrag | null>(null);
  const activeRef = useRef(false);
  const dropTargetRef = useRef<ConversationDropTarget | null>(null);

  const registerZone = useCallback(
    (zoneId: string, target: ConversationDropTarget, rect: DropZoneRect | null) => {
      if (!rect) {
        zonesRef.current.delete(zoneId);
        return;
      }
      zonesRef.current.set(zoneId, { target, rect });
    },
    [],
  );

  const requestRemeasure = useCallback(() => {
    setRemeasureKey((k) => k + 1);
  }, []);

  const clearDrag = useCallback(() => {
    pendingRef.current = null;
    activeRef.current = false;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    setGhost(null);
  }, []);

  const updateAt = useCallback((pageX: number, pageY: number, title: string) => {
    setGhost({ x: pageX, y: pageY, title });
    const target = hitTestDropZones(pageX, pageY, zonesRef.current);
    if (!dropTargetsEqual(dropTargetRef.current, target)) {
      dropTargetRef.current = target;
      setDropTarget(target);
    }
  }, []);

  const commitAt = useCallback(
    (sessionId: string, pageX: number, pageY: number) => {
      const target = hitTestDropZones(pageX, pageY, zonesRef.current);
      if (!target) return;
      const nextId = dropTargetToCollectionId(target);
      const current = getCollectionId(sessionId) ?? null;
      if (current !== nextId) {
        onMove(sessionId, nextId);
        hapticSuccess();
      }
    },
    [getCollectionId, onMove],
  );

  const createGripResponder = useCallback(
    (sessionId: string, title: string): PanResponderInstance => {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: (_, gesture) =>
          enabled &&
          (activeRef.current ||
            Math.abs(gesture.dx) > DRAG_THRESHOLD_PX ||
            Math.abs(gesture.dy) > DRAG_THRESHOLD_PX),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          pendingRef.current = {
            sessionId,
            title,
            startX: evt.nativeEvent.pageX,
            startY: evt.nativeEvent.pageY,
          };
          activeRef.current = false;
          requestRemeasure();
        },
        onPanResponderMove: (evt) => {
          const pending = pendingRef.current;
          if (!pending || pending.sessionId !== sessionId) return;

          const { pageX, pageY } = evt.nativeEvent;
          if (!activeRef.current) {
            const dx = pageX - pending.startX;
            const dy = pageY - pending.startY;
            if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
            activeRef.current = true;
            setDraggingId(sessionId);
            hapticLongPress();
          }

          updateAt(pageX, pageY, pending.title);
        },
        onPanResponderRelease: (evt) => {
          const pending = pendingRef.current;
          if (activeRef.current && pending?.sessionId === sessionId) {
            commitAt(sessionId, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          }
          clearDrag();
        },
        onPanResponderTerminate: (evt) => {
          const pending = pendingRef.current;
          if (activeRef.current && pending?.sessionId === sessionId) {
            commitAt(sessionId, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          }
          clearDrag();
        },
      });
    },
    [clearDrag, commitAt, enabled, requestRemeasure, updateAt],
  );

  const isDropActive = useCallback(
    (target: ConversationDropTarget) => dropTargetsEqual(dropTarget, target),
    [dropTarget],
  );

  return {
    draggingId,
    ghost,
    isDragging: draggingId != null,
    dropTarget,
    remeasureKey,
    registerZone,
    requestRemeasure,
    createGripResponder,
    isDropActive,
  };
}
