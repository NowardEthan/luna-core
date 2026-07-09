import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SessionItem } from '../data/fixtures';
import { parentFolderId } from '../lib/conversationOrganize/explorer';
import type { ConversationFolder } from '../lib/conversationOrganize/types';
import {
  createConversationFolder,
  deleteConversationFolder,
  moveConversationToFolder,
  renameConversationFolder,
  subscribeConversationFolders,
  updateConversationFolderParent,
  updateConversationTitle,
} from '../lib/firebase/firestoreCollections';
import { toggleConversationPinned } from '../lib/firebase/firestoreUserProfile';
import {
  applyLocalOrganizeToSessions,
  localOrganizeLoad,
  localOrganizePatchSession,
  localOrganizeSaveFolders,
} from '../lib/localCollectionStorage';

function newFolderId(): string {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useConversationOrganize({
  uid,
  cloudEnabled,
  sessions,
  onRenameActiveTitle,
}: {
  uid: string | null;
  cloudEnabled: boolean;
  sessions: SessionItem[];
  onRenameActiveTitle?: (conversationId: string, title: string) => void;
}) {
  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [localReady, setLocalReady] = useState(!cloudEnabled);
  const [localFolders, setLocalFolders] = useState<ConversationFolder[]>([]);
  const [localStore, setLocalStore] = useState<Awaited<ReturnType<typeof localOrganizeLoad>> | null>(
    null,
  );

  useEffect(() => {
    if (cloudEnabled || !uid) {
      setLocalReady(true);
      return;
    }
    let cancelled = false;
    void localOrganizeLoad().then((store) => {
      if (cancelled) return;
      setLocalStore(store);
      setLocalFolders(store.folders);
      setLocalReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cloudEnabled, uid]);

  useEffect(() => {
    if (!cloudEnabled || !uid) {
      setFolders([]);
      return;
    }
    return subscribeConversationFolders(uid, setFolders);
  }, [cloudEnabled, uid]);

  const activeFolders = cloudEnabled ? folders : localFolders;

  const organizedSessions = useMemo(() => {
    if (cloudEnabled) return sessions;
    if (!localStore) return sessions;
    return applyLocalOrganizeToSessions(sessions, {
      folders: localFolders,
      sessionMeta: localStore.sessionMeta,
    });
  }, [cloudEnabled, localFolders, localStore, sessions]);

  const createFolder = useCallback(
    async (name: string, parentId?: string | null) => {
      const id = newFolderId();
      if (cloudEnabled && uid) {
        await createConversationFolder(uid, id, name, parentId);
        return id;
      }
      const next = [...localFolders, { id, name: name.trim(), parentId: parentId ?? null }];
      setLocalFolders(next);
      await localOrganizeSaveFolders(next);
      return id;
    },
    [cloudEnabled, localFolders, uid],
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (cloudEnabled && uid) {
        await renameConversationFolder(uid, folderId, name);
        return;
      }
      const next = localFolders.map((f) =>
        f.id === folderId ? { ...f, name: name.trim() } : f,
      );
      setLocalFolders(next);
      await localOrganizeSaveFolders(next);
    },
    [cloudEnabled, localFolders, uid],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const parent = parentFolderId(folderId, activeFolders);
      if (cloudEnabled && uid) {
        for (const child of activeFolders.filter((f) => f.parentId === folderId)) {
          await updateConversationFolderParent(uid, child.id, parent);
        }
        for (const session of organizedSessions.filter((s) => s.collectionId === folderId)) {
          await moveConversationToFolder(uid, session.id, parent);
        }
        await deleteConversationFolder(uid, folderId);
        return;
      }

      const reparented = activeFolders
        .filter((f) => f.id !== folderId)
        .map((f) => (f.parentId === folderId ? { ...f, parentId: parent } : f));
      setLocalFolders(reparented);
      await localOrganizeSaveFolders(reparented);

      for (const session of organizedSessions.filter((s) => s.collectionId === folderId)) {
        await localOrganizePatchSession(session.id, { collectionId: parent });
      }
      const store = await localOrganizeLoad();
      setLocalStore(store);
    },
    [activeFolders, cloudEnabled, organizedSessions, uid],
  );

  const moveSession = useCallback(
    async (conversationId: string, collectionId: string | null) => {
      if (cloudEnabled && uid) {
        await moveConversationToFolder(uid, conversationId, collectionId);
        return;
      }
      await localOrganizePatchSession(conversationId, { collectionId });
      const store = await localOrganizeLoad();
      setLocalStore(store);
    },
    [cloudEnabled, uid],
  );

  const renameSession = useCallback(
    async (conversationId: string, title: string) => {
      const trimmed = title.trim();
      if (cloudEnabled && uid) {
        await updateConversationTitle(uid, conversationId, trimmed);
      } else {
        await localOrganizePatchSession(conversationId, { title: trimmed, titleLocked: true });
        const store = await localOrganizeLoad();
        setLocalStore(store);
      }
      onRenameActiveTitle?.(conversationId, trimmed);
    },
    [cloudEnabled, onRenameActiveTitle, uid],
  );

  const togglePin = useCallback(
    async (conversationId: string, pinned: boolean) => {
      if (cloudEnabled && uid) {
        await toggleConversationPinned(uid, conversationId, pinned);
        return;
      }
      await localOrganizePatchSession(conversationId, { pinned });
      const store = await localOrganizeLoad();
      setLocalStore(store);
    },
    [cloudEnabled, uid],
  );

  return {
    ready: cloudEnabled || localReady,
    folders: activeFolders,
    sessions: organizedSessions,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSession,
    renameSession,
    togglePin,
  };
}
