import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ChatMessage, type SessionItem } from './fixtures';
import { newSessionId } from './sessionId';
import { backupAndDeleteMessage } from '../lib/firebase/firestoreTrash';
import { hapticScreenPush } from '../lib/haptics';
import {
  applyRedoBranch,
  forkTitleFromParent,
  swapBranchTimelines,
  type ActiveTimeline,
  type ArchivedBranch,
  type ForkSource,
} from '../lib/branchState';
import {
  appendForkLink,
  buildPersistedBranchState,
  getChildForksFromList,
  loadBranchState,
  loadForkLinks,
  rebuildActiveMessages,
  rebuildArchivedBranch,
  removeForkLink,
  saveBranchState,
  type ForkLink,
} from '../lib/branchStorage';
import {
  feedbackForBranch,
  feedbackForBranchDeleted,
  feedbackForFork,
  feedbackForForkDeleted,
  feedbackForTimelineSwitch,
  type MessageActionFeedback,
} from '../lib/messageActions';

type UseChatBranchingParams = {
  cloudEnabled: boolean;
  uid: string | null | undefined;
  activeSessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  setActiveSessionId: (id: string | null) => void;
  messages: ChatMessage[];
  applyThreadPrefix: (nextMessages: ChatMessage[]) => void;
  setFirestoreMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLocalMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setHydrating: (value: boolean) => void;
  recentsList: SessionItem[];
  title: string;
  setTitle: (title: string) => void;
  setDraft: (text: string) => void;
  setMessageFeedback: (feedback: MessageActionFeedback) => void;
  setLoading: (value: boolean) => void;
  flush: () => Promise<void> | void;
  bumpThreadEnter: (quick: boolean) => void;
  setScreen: (screen: 'home' | 'thread') => void;
  deleteConversation: (id: string) => Promise<void>;
  branchPointRef: MutableRefObject<number | null>;
  activeTimelineRef: MutableRefObject<ActiveTimeline>;
  archivedBranchRef: MutableRefObject<ArchivedBranch | null>;
};

/**
 * Branching/forking: estado do galho arquivado, forks (sessões-filhas) e as
 * ações que criam/trocam/apagam ramos. É o domínio mais cross-cutting — grava
 * direto nos refs (para o merge do useChatMessages ver o valor já atualizado
 * antes do próximo render) e recebe mensagens/navegação/título injetados,
 * no mesmo padrão de DI das fases 1 e 2.
 */
export function useChatBranching({
  cloudEnabled,
  uid,
  activeSessionId,
  sessionIdRef,
  setActiveSessionId,
  messages,
  applyThreadPrefix,
  setFirestoreMessages,
  setLocalMessages,
  setHydrating,
  recentsList,
  title,
  setTitle,
  setDraft,
  setMessageFeedback,
  setLoading,
  flush,
  bumpThreadEnter,
  setScreen,
  deleteConversation,
  branchPointRef,
  activeTimelineRef,
  archivedBranchRef,
}: UseChatBranchingParams) {
  const [archivedBranch, setArchivedBranch] = useState<ArchivedBranch | null>(null);
  const [branchPoint, setBranchPoint] = useState<number | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<ActiveTimeline>('continuation');
  const [forkSource, setForkSource] = useState<ForkSource | null>(null);
  const [forkLinks, setForkLinks] = useState<ForkLink[]>([]);

  useEffect(() => {
    void loadForkLinks().then(setForkLinks);
  }, []);

  useEffect(() => {
    branchPointRef.current = branchPoint;
    activeTimelineRef.current = activeTimeline;
    archivedBranchRef.current = archivedBranch;
  }, [activeTimeline, archivedBranch, branchPoint, activeTimelineRef, archivedBranchRef, branchPointRef]);

  const resetBranchState = useCallback(() => {
    setArchivedBranch(null);
    setBranchPoint(null);
    setActiveTimeline('continuation');
    setForkSource(null);
  }, []);

  const childForks = useMemo(() => {
    const sid = activeSessionId ?? sessionIdRef.current;
    if (!sid) return [];
    return getChildForksFromList(forkLinks, sid);
  }, [activeSessionId, forkLinks, sessionIdRef]);

  const persistBranchForSession = useCallback(
    (sid: string) => {
      if (branchPoint == null || !archivedBranch) return;
      void saveBranchState(
        sid,
        buildPersistedBranchState(branchPoint, activeTimeline, archivedBranch, messages),
      );
    },
    [activeTimeline, archivedBranch, branchPoint, messages],
  );

  useEffect(() => {
    const sid = activeSessionId ?? sessionIdRef.current;
    if (!sid || branchPoint == null || !archivedBranch) return;
    persistBranchForSession(sid);
  }, [activeSessionId, activeTimeline, archivedBranch, branchPoint, messages, persistBranchForSession, sessionIdRef]);

  const restoreBranchForSession = useCallback(
    async (id: string, warmMessages: ChatMessage[]) => {
      const persisted = await loadBranchState(id);
      const links = await loadForkLinks();
      setForkLinks(links);

      const parentLink = links.find((l) => l.childSessionId === id);
      if (parentLink) {
        const parentTitle =
          recentsList.find((s) => s.id === parentLink.parentSessionId)?.title ?? 'Conversa original';
        setForkSource({ sessionId: parentLink.parentSessionId, title: parentTitle });
      } else {
        setForkSource(null);
      }

      if (!persisted || persisted.branchPoint <= 0) {
        setBranchPoint(null);
        setArchivedBranch(null);
        setActiveTimeline('continuation');
        return;
      }

      const prefix =
        warmMessages.length >= persisted.branchPoint
          ? warmMessages.slice(0, persisted.branchPoint)
          : warmMessages;
      const merged = rebuildActiveMessages(prefix, persisted);

      setBranchPoint(persisted.branchPoint);
      setActiveTimeline(persisted.activeTimeline);
      setArchivedBranch(rebuildArchivedBranch(persisted, persisted.activeTimeline));

      if (cloudEnabled) {
        setFirestoreMessages(merged);
        setLocalMessages(merged);
      } else {
        setLocalMessages(merged);
      }
    },
    [cloudEnabled, recentsList, setFirestoreMessages, setLocalMessages],
  );

  const forkFromMessage = useCallback(
    (messageId: string, includeMessage: boolean) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;

      const prefix = messages.slice(0, includeMessage ? index + 1 : index);
      const parentId = activeSessionId ?? sessionIdRef.current;
      const parentTitle = title;

      void flush();
      hapticScreenPush();

      const sid = newSessionId();
      const childTitle = forkTitleFromParent(parentTitle);
      sessionIdRef.current = sid;
      setActiveSessionId(sid);
      resetBranchState();
      if (parentId) {
        setForkSource({ sessionId: parentId, title: parentTitle });
        void appendForkLink({
          parentSessionId: parentId,
          childSessionId: sid,
          childTitle,
          createdAt: new Date().toISOString(),
        }).then(() => void loadForkLinks().then(setForkLinks));
      }
      applyThreadPrefix(prefix);
      setHydrating(false);
      setLoading(false);

      setTitle(childTitle);

      bumpThreadEnter(false);
      setScreen('thread');
      setMessageFeedback(feedbackForFork(prefix.length, parentTitle));
    },
    [
      activeSessionId,
      applyThreadPrefix,
      bumpThreadEnter,
      flush,
      messages,
      resetBranchState,
      sessionIdRef,
      setActiveSessionId,
      setHydrating,
      setLoading,
      setMessageFeedback,
      setScreen,
      setTitle,
      title,
    ],
  );

  const branchFromMessage = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;

      const { prefix, archived, composerDraft, branchPoint: bp } = applyRedoBranch(messages, index);
      const sid = activeSessionId ?? sessionIdRef.current;

      applyThreadPrefix(prefix);
      branchPointRef.current = bp;
      activeTimelineRef.current = 'continuation';
      archivedBranchRef.current = archived;
      setArchivedBranch(archived);
      setBranchPoint(bp);
      setActiveTimeline('continuation');
      setForkSource(null);
      setDraft(composerDraft);
      setMessageFeedback(feedbackForBranch(archived.messages.length));

      if (cloudEnabled && uid && sid) {
        for (const m of archived.messages) {
          void backupAndDeleteMessage(uid, sid, m);
        }
      }
    },
    [
      activeSessionId,
      activeTimelineRef,
      applyThreadPrefix,
      archivedBranchRef,
      branchPointRef,
      cloudEnabled,
      messages,
      sessionIdRef,
      setDraft,
      setMessageFeedback,
      uid,
    ],
  );

  const toggleArchivedBranch = useCallback(() => {
    setArchivedBranch((prev) => (prev ? { ...prev, expanded: !prev.expanded } : prev));
  }, []);

  const expandInactiveBranch = useCallback(() => {
    setArchivedBranch((prev) => (prev ? { ...prev, expanded: true } : prev));
  }, []);

  const switchBranchTimeline = useCallback(
    (target: ActiveTimeline) => {
      if (!archivedBranch || branchPoint == null || target === activeTimeline) return;

      const swapped = swapBranchTimelines(messages, branchPoint, archivedBranch, activeTimeline);

      activeTimelineRef.current = swapped.activeTimeline;
      archivedBranchRef.current = swapped.archivedBranch;

      applyThreadPrefix(swapped.messages);
      setArchivedBranch(swapped.archivedBranch);
      setActiveTimeline(swapped.activeTimeline);
      setMessageFeedback(feedbackForTimelineSwitch(swapped.activeTimeline));
    },
    [
      activeTimeline,
      activeTimelineRef,
      applyThreadPrefix,
      archivedBranch,
      archivedBranchRef,
      branchPoint,
      messages,
      setMessageFeedback,
    ],
  );

  const deleteBranchTimeline = useCallback(
    (timelineToDelete: ActiveTimeline) => {
      if (!archivedBranch || branchPoint == null) return;
      const sid = activeSessionId ?? sessionIdRef.current;

      if (timelineToDelete === activeTimeline) {
        const prefix = messages.slice(0, branchPoint);
        const promoted = [...prefix, ...archivedBranch.messages];
        applyThreadPrefix(promoted);
      }

      branchPointRef.current = null;
      activeTimelineRef.current = 'continuation';
      archivedBranchRef.current = null;
      resetBranchState();
      if (sid) void saveBranchState(sid, null);
      setMessageFeedback(
        feedbackForBranchDeleted(timelineToDelete === activeTimeline ? 'active' : 'inactive'),
      );
    },
    [
      activeSessionId,
      activeTimeline,
      activeTimelineRef,
      applyThreadPrefix,
      archivedBranch,
      archivedBranchRef,
      branchPoint,
      branchPointRef,
      messages,
      resetBranchState,
      sessionIdRef,
      setMessageFeedback,
    ],
  );

  const deleteForkBranch = useCallback(
    async (childSessionId: string, childTitle?: string) => {
      await removeForkLink(childSessionId);
      setForkLinks(await loadForkLinks());
      await deleteConversation(childSessionId);
      setMessageFeedback(feedbackForForkDeleted(childTitle));
    },
    [deleteConversation, setMessageFeedback],
  );

  return {
    archivedBranch,
    branchPoint,
    activeTimeline,
    forkSource,
    childForks,
    resetBranchState,
    restoreBranchForSession,
    forkFromMessage,
    branchFromMessage,
    toggleArchivedBranch,
    expandInactiveBranch,
    switchBranchTimeline,
    deleteBranchTimeline,
    deleteForkBranch,
  };
}
