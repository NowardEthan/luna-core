import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { demoThread } from './fixtures';
import { useChatMessages } from './useChatMessages';
import { useConversationsList } from './useConversationsList';
import { useChatBranching } from './useChatBranching';
import { useChatSend } from './useChatSend';
import { useVoiceMessages } from './useVoiceMessages';
import { useMessageActions } from './useMessageActions';
import { newSessionId } from './sessionId';
import type { LunaHumorBadge } from '../lib/lunaHumor';
import { feedbackQuotaExceeded } from '../features/billing/quotaUtils';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useKeyboardOpen } from '../hooks/useKeyboardBottomInset';
import { useDeferredMessageFeedback } from '../hooks/useDeferredMessageFeedback';
import { usePersistedDraft } from '../hooks/usePersistedDraft';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  DRAFT_SCOPE_HOME,
  draftScopeForSession,
  loadChatDraftMeta,
  saveChatDraftMeta,
} from '../lib/draftStorage';
import { fetchConversationTitle } from '../lib/firebase/firestoreChat';
import {
  getWarmSnapshot,
  seedWarmSnapshot,
  warmSession,
} from '../lib/conversationWarmCache';
import type { ActiveTimeline, ArchivedBranch } from '../lib/branchState';
import type { ThreadReference } from '../lib/messageReference';
import { hapticScreenPop, hapticScreenPush } from '../lib/haptics';
import { runAfterTransition } from '../hooks/useNavigationPerf';
import { useConversationPrefetch, prefetchSessionOnTouch } from '../hooks/useConversationPrefetch';
import type { ScreenEnterMode } from '../components/ScreenPane';
import type { OrbitTabId } from '../components/OrbitTabBar';

type Screen = 'home' | 'thread';

type OpenSessionOptions = {
  restore?: boolean;
  scrollY?: number;
  cachedTitle?: string;
};

export function useOrbitChat() {
  const auth = useLunaAuth();
  const keyboardOpen = useKeyboardOpen();
  const lunaUsage = useLunaUsageContext();
  const profile = useUserProfile(auth.user, 'Você');
  const { selection: lunaProvider, legacyApi, setLastRouting } = useLunaProvider();
  const cloudEnabled = auth.configured && auth.uid != null;

  const [screen, setScreen] = useState<Screen>('home');
  const [navReady, setNavReady] = useState(false);
  const [mainTab, setMainTabState] = useState<OrbitTabId>('inicio');
  const [threadScrollRestore, setThreadScrollRestore] = useState<number | undefined>();
  const mainTabRef = useRef<OrbitTabId>('inicio');
  const threadScrollYRef = useRef(0);
  const navRestoredRef = useRef(false);
  const titleRef = useRef('Luna');
  const [threadEnter, setThreadEnter] = useState<{ key: number; mode: ScreenEnterMode }>({
    key: 0,
    mode: 'push',
  });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Luna');
  const sessionIdRef = useRef<string | null>(null);
  const prevActiveSessionRef = useRef<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { feedback: messageFeedback, pushFeedback: setMessageFeedback } =
    useDeferredMessageFeedback(keyboardOpen);

  const blockIfQuotaExceeded = useCallback((): boolean => {
    if (lunaUsage.canSendCloudTurn) return false;
    setMessageFeedback(feedbackQuotaExceeded(lunaUsage.usage));
    return true;
  }, [lunaUsage.canSendCloudTurn, lunaUsage.usage, setMessageFeedback]);

  const [messageReference, setMessageReference] = useState<ThreadReference | null>(null);
  const [lunaHumorAtual, setLunaHumorAtual] = useState<LunaHumorBadge | null>(null);

  const branchPointRef = useRef<number | null>(null);
  const activeTimelineRef = useRef<ActiveTimeline>('continuation');
  const archivedBranchRef = useRef<ArchivedBranch | null>(null);

  const {
    messages,
    localMessages,
    setLocalMessages,
    firestoreMessages,
    setFirestoreMessages,
    hydrating,
    setHydrating,
    setLocalAudioByMessageId,
    updateMessageById,
    applyThreadPrefix,
  } = useChatMessages({
    cloudEnabled,
    uid: auth.uid,
    activeSessionId,
    setSyncError,
    branchPointRef,
    activeTimelineRef,
    archivedBranchRef,
  });

  const clearActiveSessionIfMatch = useCallback(
    (id: string) => {
      if (activeSessionId !== id && sessionIdRef.current !== id) return;
      sessionIdRef.current = null;
      setActiveSessionId(null);
      setFirestoreMessages([]);
      setLocalMessages([]);
      setLocalAudioByMessageId({});
      setTitle('Luna');
      if (screen === 'thread') setScreen('home');
    },
    [activeSessionId, screen],
  );

  const {
    recentsList,
    trashSessions,
    renameActiveConversationTitle,
    deleteConversation,
    restoreConversation,
    permanentDeleteTrash,
  } = useConversationsList({
    cloudEnabled,
    uid: auth.uid,
    activeSessionId,
    sessionIdRef,
    messages,
    setSyncError,
    clearActiveSessionIfMatch,
    setTitle,
    titleRef,
  });

  const clearMessageReference = useCallback(() => {
    setMessageReference(null);
  }, []);

  const draftScope = useMemo(() => {
    if (screen === 'home') return DRAFT_SCOPE_HOME;
    const sid = activeSessionId ?? sessionIdRef.current;
    return sid ? draftScopeForSession(sid) : `${DRAFT_SCOPE_HOME}.pending`;
  }, [screen, activeSessionId]);

  const { draft, setDraft, clearDraft, flush } = usePersistedDraft(draftScope);

  const ensureSessionId = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = newSessionId();
      setActiveSessionId(sessionIdRef.current);
    }
    return sessionIdRef.current;
  }, []);

  const bumpThreadEnter = useCallback((quick: boolean) => {
    setThreadEnter((prev) => ({
      key: prev.key + 1,
      mode: quick ? 'pushQuick' : 'push',
    }));
  }, []);

  const {
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
  } = useChatBranching({
    cloudEnabled,
    uid: auth.uid,
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
  });

  const startNewChat = useCallback(() => {
    void flush();
    hapticScreenPush();
    resetBranchState();
    clearMessageReference();
    setLunaHumorAtual(null);
    setTitle('Luna');
    setLocalMessages([]);
    setFirestoreMessages([]);
    setHydrating(false);
    const sid = newSessionId();
    sessionIdRef.current = sid;
    setActiveSessionId(sid);
    setLocalAudioByMessageId({});
    setLoading(false);
    bumpThreadEnter(false);
    setScreen('thread');
  }, [bumpThreadEnter, clearMessageReference, flush, resetBranchState]);

  const {
    callLuna,
    deliverLunaError,
    submit,
    sendFromThread,
    sendFromHome,
    sendSuggestion,
    sendRosaryMessage,
    sendRosaryReflection,
  } = useChatSend({
    cloudEnabled,
    uid: auth.uid,
    getIdToken: auth.getIdToken,
    displayName: profile.displayName,
    lunaProvider,
    legacyApi,
    setLastRouting,
    lunaUsage,
    blockIfQuotaExceeded,
    messageReference,
    clearMessageReference,
    ensureSessionId,
    sessionIdRef,
    messages,
    branchPoint,
    setLocalMessages,
    updateMessageById,
    loading,
    setLoading,
    setLunaHumorAtual,
    setMessageFeedback,
    draft,
    clearDraft,
    startNewChat,
  });

  const { sendVoiceMessage, requestTranscript } = useVoiceMessages({
    loading,
    screen,
    startNewChat,
    cloudEnabled,
    uid: auth.uid,
    getIdToken: auth.getIdToken,
    lunaUsage,
    blockIfQuotaExceeded,
    messageReference,
    clearMessageReference,
    setMessageFeedback,
    setLocalMessages,
    setLocalAudioByMessageId,
    updateMessageById,
    firestoreMessages,
    localMessages,
    ensureSessionId,
    sessionIdRef,
    clearDraft,
    setLoading,
    callLuna,
    deliverLunaError,
  });

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const persistNavMeta = useCallback(() => {
    void saveChatDraftMeta({
      screen,
      sessionId: activeSessionId,
      mainTab: mainTabRef.current,
      threadScrollY: threadScrollYRef.current,
      title: titleRef.current,
    });
  }, [screen, activeSessionId]);

  useEffect(() => {
    persistNavMeta();
  }, [persistNavMeta, mainTab, title]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        persistNavMeta();
        void flush();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [flush, persistNavMeta]);

  const setMainTab = useCallback((tab: OrbitTabId) => {
    mainTabRef.current = tab;
    setMainTabState(tab);
  }, []);

  const onThreadScrollOffset = useCallback((y: number) => {
    threadScrollYRef.current = y;
  }, []);

  const clearThreadScrollRestore = useCallback(() => {
    setThreadScrollRestore(undefined);
  }, []);

  useEffect(() => {
    if (!cloudEnabled || !auth.uid) return;
    const prev = prevActiveSessionRef.current;
    if (prev && prev !== activeSessionId) {
      warmSession(auth.uid, prev);
    }
    prevActiveSessionRef.current = activeSessionId;
  }, [activeSessionId, auth.uid, cloudEnabled]);

  useConversationPrefetch({
    uid: auth.uid,
    cloudEnabled,
    recents: recentsList,
    activeSessionId,
  });

  useEffect(() => {
    setLunaHumorAtual(null);
  }, [activeSessionId]);

  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'luna' && msg.humor) {
        setLunaHumorAtual(msg.humor);
        return;
      }
    }
  }, [messages, activeSessionId]);

  const openSession = useCallback(
    (id: string, opts?: OpenSessionOptions) => {
      const restoring = opts?.restore === true;
      if (!restoring) {
        void flush();
        hapticScreenPush();
      }

      if (id === activeSessionId && sessionIdRef.current === id) {
        setHydrating(false);
        if (restoring) {
          if (opts?.scrollY != null && opts.scrollY > 0) {
            setThreadScrollRestore(opts.scrollY);
          }
          setThreadEnter({ key: 0, mode: 'none' });
        } else {
          bumpThreadEnter(true);
        }
        setScreen('thread');
        return;
      }

      resetBranchState();
      clearMessageReference();
      setLunaHumorAtual(null);

      sessionIdRef.current = id;
      setActiveSessionId(id);
      setLocalMessages([]);
      setLocalAudioByMessageId({});

      const warm = getWarmSnapshot(id);
      const recentTitle =
        opts?.cachedTitle ?? recentsList.find((s) => s.id === id)?.title;
      const warmMessages = warm?.messages ?? [];

      if (cloudEnabled && auth.uid) {
        setFirestoreMessages(warmMessages);
        setHydrating(warmMessages.length === 0);
        setTitle(warm?.title ?? recentTitle ?? 'Luna');
        if (!warm?.title || warm.title === 'Luna') {
          void fetchConversationTitle(auth.uid, id).then(setTitle);
        }
        void restoreBranchForSession(id, warmMessages);
      } else {
        setHydrating(false);
        setTitle(warm?.title ?? recentTitle ?? 'Luna');
        const localWarm = warm?.messages ?? demoThread;
        setLocalMessages(localWarm);
        sessionIdRef.current = `orbit-${id}`;
        void restoreBranchForSession(id, localWarm);
      }

      setLoading(false);
      if (restoring) {
        if (opts?.scrollY != null && opts.scrollY > 0) {
          setThreadScrollRestore(opts.scrollY);
        }
        setThreadEnter({ key: 0, mode: 'none' });
      } else {
        bumpThreadEnter(false);
      }
      setScreen('thread');
    },
    [activeSessionId, auth.uid, bumpThreadEnter, clearMessageReference, cloudEnabled, flush, recentsList, resetBranchState, restoreBranchForSession],
  );

  const prefetchSession = useCallback(
    (id: string) => {
      prefetchSessionOnTouch(auth.uid, cloudEnabled, id);
    },
    [auth.uid, cloudEnabled],
  );

  const backToHome = useCallback(() => {
    hapticScreenPop();
    threadScrollYRef.current = 0;
    setThreadScrollRestore(undefined);
    setScreen('home');
    void flush();

    const sid = activeSessionId;
    const cloudMsgs = firestoreMessages;
    const localMsgs = localMessages;
    const sessionTitle = title;

    runAfterTransition(() => {
      if (cloudEnabled && sid && cloudMsgs.length > 0) {
        seedWarmSnapshot(sid, cloudMsgs, sessionTitle);
      } else if (!cloudEnabled && sid && localMsgs.length > 0) {
        seedWarmSnapshot(sid, localMsgs, sessionTitle);
      }
    });
  }, [activeSessionId, cloudEnabled, firestoreMessages, flush, localMessages, title]);

  const openForkSource = useCallback(() => {
    if (!forkSource) return;
    openSession(forkSource.sessionId);
  }, [forkSource, openSession]);

  const { runMessageAction, truncateThreadFromIndex } = useMessageActions({
    activeSessionId,
    sessionIdRef,
    cloudEnabled,
    uid: auth.uid,
    messages,
    applyThreadPrefix,
    resetBranchState,
    setDraft,
    setMessageFeedback,
    submit,
    callLuna,
    forkFromMessage,
  });

  useEffect(() => {
    if (auth.configured && auth.loading) return;
    if (navRestoredRef.current) return;
    navRestoredRef.current = true;

    void (async () => {
      try {
        const meta = await loadChatDraftMeta();
        if (meta?.mainTab) {
          mainTabRef.current = meta.mainTab;
          setMainTabState(meta.mainTab);
        }
        if (meta?.screen === 'thread' && meta.sessionId) {
          openSession(meta.sessionId, {
            restore: true,
            scrollY: meta.threadScrollY,
            cachedTitle: meta.title,
          });
        }
      } finally {
        setNavReady(true);
      }
    })();
  }, [auth.configured, auth.loading, openSession]);

  return {
    screen,
    navReady,
    mainTab,
    setMainTab,
    threadScrollRestore,
    onThreadScrollOffset,
    clearThreadScrollRestore,
    activeSessionId,
    threadEnterKey: threadEnter.key,
    threadEnterMode: threadEnter.mode,
    hydrating,
    messages,
    draft,
    loading: loading || auth.loading,
    title,
    recents: recentsList,
    trashSessions,
    syncError,
    authLoading: auth.loading,
    authError: auth.error,
    setDraft,
    openSession,
    prefetchSession,
    startNewChat,
    backToHome,
    sendFromThread,
    sendFromHome,
    sendSuggestion,
    sendRosaryMessage,
    sendRosaryReflection,
    sendVoiceMessage,
    requestTranscript,
    runMessageAction,
    branchFromMessage,
    truncateThreadFromIndex,
    messageFeedback,
    archivedBranch,
    branchPoint,
    activeTimeline,
    forkSource,
    childForks,
    toggleArchivedBranch,
    expandInactiveBranch,
    switchBranchTimeline,
    deleteBranchTimeline,
    deleteForkBranch,
    openForkSource,
    messageReference,
    setMessageReference,
    clearMessageReference,
    lunaHumorAtual,
    setMessageFeedback,
    deleteConversation,
    restoreConversation,
    permanentDeleteTrash,
    renameActiveConversationTitle,
    cloudEnabled,
  };
}
