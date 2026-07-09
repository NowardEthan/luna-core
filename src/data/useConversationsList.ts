import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ChatMessage, demoThread, sessions, type SessionItem } from './fixtures';
import { subscribeConversations } from '../lib/firebase/firestoreChat';
import { stopWarmSession } from '../lib/conversationWarmCache';
import {
  backupAndDeleteConversation,
  permanentlyDeleteFromTrash,
  restoreConversationFromTrash,
  subscribeTrashConversations,
  type TrashSessionItem,
} from '../lib/firebase/firestoreTrash';
import {
  localTrashBackupConversation,
  localTrashList,
  localTrashPermanentDelete,
  localTrashRestore,
} from '../lib/localTrashStorage';

type UseConversationsListParams = {
  cloudEnabled: boolean;
  uid: string | null | undefined;
  activeSessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  messages: ChatMessage[];
  setSyncError: (message: string | null) => void;
  clearActiveSessionIfMatch: (id: string) => void;
  setTitle: (title: string) => void;
  titleRef: MutableRefObject<string>;
};

/**
 * Lista de conversas (recentes + lixeira) e as ações que mexem nela.
 * `syncError` e `title` continuam em useOrbitChat — são estado compartilhado
 * com outros domínios (mensagens, navegação) — por isso entram como parâmetro,
 * no mesmo padrão dos branch refs da fase 1.
 */
export function useConversationsList({
  cloudEnabled,
  uid,
  activeSessionId,
  sessionIdRef,
  messages,
  setSyncError,
  clearActiveSessionIfMatch,
  setTitle,
  titleRef,
}: UseConversationsListParams) {
  const [recents, setRecents] = useState<typeof sessions>([]);
  const [trashSessions, setTrashSessions] = useState<TrashSessionItem[]>([]);
  const [deletedDemoIds, setDeletedDemoIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!cloudEnabled || !uid) {
      setRecents([]);
      setSyncError(null);
      return;
    }
    setSyncError(null);
    return subscribeConversations(
      uid,
      setRecents,
      (err) => setSyncError(err.message || 'Erro ao carregar conversas.'),
    );
  }, [cloudEnabled, uid, setSyncError]);

  useEffect(() => {
    if (!cloudEnabled || !uid) {
      setTrashSessions([]);
      void localTrashList().then(setTrashSessions);
      return;
    }
    return subscribeTrashConversations(
      uid,
      setTrashSessions,
      (err) => setSyncError(err.message || 'Erro ao carregar lixeira.'),
    );
  }, [cloudEnabled, uid, setSyncError]);

  const recentsList = useMemo(
    () => (cloudEnabled ? recents : sessions.filter((s) => !deletedDemoIds.has(s.id))),
    [cloudEnabled, deletedDemoIds, recents],
  );

  const renameActiveConversationTitle = useCallback(
    (conversationId: string, newTitle: string) => {
      const sid = activeSessionId ?? sessionIdRef.current;
      if (sid === conversationId) {
        setTitle(newTitle);
        titleRef.current = newTitle;
      }
      if (!cloudEnabled) {
        setRecents((prev) =>
          prev.map((s) => (s.id === conversationId ? { ...s, title: newTitle } : s)),
        );
      }
    },
    [activeSessionId, cloudEnabled, sessionIdRef, setTitle, titleRef],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const sessionMeta =
        recentsList.find((s) => s.id === id) ??
        trashSessions.find((s) => s.id === id) ??
        ({ id, title: 'Conversa', preview: '', updatedAt: 'agora' } satisfies SessionItem);

      clearActiveSessionIfMatch(id);
      stopWarmSession(id);
      setSyncError(null);

      if (cloudEnabled && uid) {
        setRecents((prev) => prev.filter((s) => s.id !== id));
        const result = await backupAndDeleteConversation(uid, id);
        if (result === 'failed') {
          setSyncError('Não foi possível apagar a conversa.');
        }
        return;
      }

      const msgs = id === activeSessionId || sessionIdRef.current === id ? messages : demoThread;
      await localTrashBackupConversation(sessionMeta, msgs);
      setDeletedDemoIds((prev) => new Set(prev).add(id));
      setTrashSessions(await localTrashList());
    },
    [
      activeSessionId,
      uid,
      clearActiveSessionIfMatch,
      cloudEnabled,
      messages,
      recentsList,
      sessionIdRef,
      setSyncError,
      trashSessions,
    ],
  );

  const restoreConversation = useCallback(
    async (id: string) => {
      if (cloudEnabled && uid) {
        try {
          await restoreConversationFromTrash(uid, id);
        } catch {
          setSyncError('Não foi possível restaurar a conversa.');
        }
        return;
      }

      const restored = await localTrashRestore(id);
      if (!restored) return;
      setDeletedDemoIds((prev) => {
        const next = new Set(prev);
        next.delete(restored.session.id);
        return next;
      });
      setTrashSessions(await localTrashList());
    },
    [uid, cloudEnabled, setSyncError],
  );

  const permanentDeleteTrash = useCallback(
    async (id: string) => {
      if (cloudEnabled && uid) {
        try {
          await permanentlyDeleteFromTrash(uid, id);
        } catch {
          setSyncError('Não foi possível apagar da lixeira.');
        }
        return;
      }
      await localTrashPermanentDelete(id);
      setTrashSessions(await localTrashList());
    },
    [uid, cloudEnabled, setSyncError],
  );

  return {
    recentsList,
    trashSessions,
    renameActiveConversationTitle,
    deleteConversation,
    restoreConversation,
    permanentDeleteTrash,
  };
}
