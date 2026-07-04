import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage, demoThread, sessions, VoiceClip, type SessionItem } from './fixtures';
import { LunaApiError, lunaChat } from './lunaClient';
import { describeImageAttachmentsSafe } from './describeImageAttachments';
import { extractDocumentAttachmentsSafe } from './extractDocumentAttachments';
import { transcribeVoiceClip } from './transcribeVoice';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { usePersistedDraft } from '../hooks/usePersistedDraft';
import {
  DRAFT_SCOPE_HOME,
  draftScopeForSession,
  saveChatDraftMeta,
} from '../lib/draftStorage';
import {
  fetchConversationTitle,
  subscribeConversations,
  subscribeMessages,
  updateMessageTranscript,
  writeLunaTextMessage,
  writeUserTextMessage,
  writeUserVoiceMessage,
} from '../lib/firebase/firestoreChat';
import {
  isRemoteMediaUri,
  uploadChatAttachments,
  uploadVoiceClip,
} from '../lib/firebase/uploadChatMedia';
import {
  getWarmSnapshot,
  releaseWarmForActive,
  seedWarmSnapshot,
  stopWarmSession,
  warmSession,
} from '../lib/conversationWarmCache';
import {
  backupAndDeleteConversation,
  backupAndDeleteMessage,
  permanentlyDeleteFromTrash,
  restoreConversationFromTrash,
  subscribeTrashConversations,
  type TrashSessionItem,
} from '../lib/firebase/firestoreTrash';
import {
  attachmentsPreviewLabel,
  formatAttachmentsForApi,
  formatAttachmentsForLunaApi,
  type ComposerSendPayload,
} from '../lib/composerAttachmentModel';
import { isReadableDocumentAttachment } from '../lib/readableDocuments';
import {
  MESSAGE_FEEDBACK_MS,
  copyMessageAction,
  feedbackForBranch,
  feedbackForBranchContinuation,
  feedbackForBranchDeleted,
  feedbackForFork,
  feedbackForForkDeleted,
  feedbackForTimelineSwitch,
  feedbackForTruncate,
  messageCopyText,
  planRedoLunaRegenerate,
  planRedoMessage,
  planResendMessage,
  type MessageActionFeedback,
  type MessageSheetAction,
} from '../lib/messageActions';
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
import { formatMessageWithReference, normalizeMessagesForDisplay, type ThreadReference } from '../lib/messageReference';
import {
  localTrashBackupConversation,
  localTrashList,
  localTrashPermanentDelete,
  localTrashRestore,
} from '../lib/localTrashStorage';
import { hapticScreenPop, hapticScreenPush } from '../lib/haptics';
import { runAfterTransition } from '../hooks/useNavigationPerf';
import { useConversationPrefetch, prefetchSessionOnTouch } from '../hooks/useConversationPrefetch';
import type { ScreenEnterMode } from '../components/ScreenPane';

type Screen = 'home' | 'thread';

function newSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function newMessageId(prefix: 'u' | 'l'): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useOrbitChat() {
  const auth = useLunaAuth();
  const { selection: lunaProvider, legacyApi, setLastRouting } = useLunaProvider();
  const cloudEnabled = auth.configured && auth.uid != null;

  const [screen, setScreen] = useState<Screen>('home');
  const [threadEnter, setThreadEnter] = useState<{ key: number; mode: ScreenEnterMode }>({
    key: 0,
    mode: 'push',
  });
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessage[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const [recents, setRecents] = useState<typeof sessions>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Luna');
  const sessionIdRef = useRef<string | null>(null);
  const prevActiveSessionRef = useRef<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localAudioByMessageId, setLocalAudioByMessageId] = useState<Record<string, VoiceClip>>({});
  const [trashSessions, setTrashSessions] = useState<TrashSessionItem[]>([]);
  const [deletedDemoIds, setDeletedDemoIds] = useState<Set<string>>(() => new Set());
  const [messageFeedback, setMessageFeedback] = useState<MessageActionFeedback | null>(null);
  const [archivedBranch, setArchivedBranch] = useState<ArchivedBranch | null>(null);
  const [branchPoint, setBranchPoint] = useState<number | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<ActiveTimeline>('continuation');
  const [forkSource, setForkSource] = useState<ForkSource | null>(null);
  const [forkLinks, setForkLinks] = useState<ForkLink[]>([]);
  const [messageReference, setMessageReference] = useState<ThreadReference | null>(null);

  const branchPointRef = useRef<number | null>(null);
  const activeTimelineRef = useRef<ActiveTimeline>('continuation');
  const archivedBranchRef = useRef<ArchivedBranch | null>(null);

  useEffect(() => {
    branchPointRef.current = branchPoint;
    activeTimelineRef.current = activeTimeline;
    archivedBranchRef.current = archivedBranch;
  }, [activeTimeline, archivedBranch, branchPoint]);

  useEffect(() => {
    void loadForkLinks().then(setForkLinks);
  }, []);

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
  }, [activeSessionId, forkLinks]);

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

  useEffect(() => {
    void saveChatDraftMeta({ screen, sessionId: activeSessionId });
  }, [screen, activeSessionId]);

  useEffect(() => {
    if (!cloudEnabled || !auth.uid) {
      setRecents([]);
      setSyncError(null);
      return;
    }
    setSyncError(null);
    return subscribeConversations(
      auth.uid,
      setRecents,
      (err) => setSyncError(err.message || 'Erro ao carregar conversas.'),
    );
  }, [cloudEnabled, auth.uid]);

  useEffect(() => {
    if (!cloudEnabled || !auth.uid || !activeSessionId) return;
    releaseWarmForActive(activeSessionId);
    return subscribeMessages(
      auth.uid,
      activeSessionId,
      (msgs) => {
        setFirestoreMessages((current) => {
          const bp = branchPointRef.current;
          const archived = archivedBranchRef.current;
          const timeline = activeTimelineRef.current;
          if (bp == null || !archived || msgs.length < bp) return msgs;

          const prefix = msgs.slice(0, bp);
          if (timeline === 'continuation') {
            return [...prefix, ...msgs.slice(bp)];
          }
          // Ramo arquivado activo — o tail do servidor é o outro caminho; manter só o local.
          const activeTail = current.length > bp ? current.slice(bp) : archived.messages;
          return [...prefix, ...activeTail];
        });
        setHydrating(false);
      },
      (err) => {
        setSyncError(err.message || 'Erro ao carregar mensagens.');
        setHydrating(false);
      },
    );
  }, [cloudEnabled, auth.uid, activeSessionId]);

  useEffect(() => {
    if (!cloudEnabled || !auth.uid) return;
    const prev = prevActiveSessionRef.current;
    if (prev && prev !== activeSessionId) {
      warmSession(auth.uid, prev);
    }
    prevActiveSessionRef.current = activeSessionId;
  }, [activeSessionId, auth.uid, cloudEnabled]);

  useEffect(() => {
    if (!cloudEnabled || !auth.uid) {
      setTrashSessions([]);
      void localTrashList().then(setTrashSessions);
      return;
    }
    return subscribeTrashConversations(
      auth.uid,
      setTrashSessions,
      (err) => setSyncError(err.message || 'Erro ao carregar lixeira.'),
    );
  }, [cloudEnabled, auth.uid]);

  useEffect(() => {
    if (!messageFeedback) return;
    const t = setTimeout(() => setMessageFeedback(null), MESSAGE_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [messageFeedback]);

  const recentsList = useMemo(
    () => (cloudEnabled ? recents : sessions.filter((s) => !deletedDemoIds.has(s.id))),
    [cloudEnabled, deletedDemoIds, recents],
  );

  useConversationPrefetch({
    uid: auth.uid,
    cloudEnabled,
    recents: recentsList,
    activeSessionId,
  });

  const messages = useMemo(() => {
    if (!cloudEnabled) return normalizeMessagesForDisplay(localMessages);

    const map = new Map<string, ChatMessage>();
    for (const m of firestoreMessages) {
      const localAudio = localAudioByMessageId[m.id];
      let audio = m.audio;
      if (localAudio) {
        const preferRemote =
          isRemoteMediaUri(m.audio?.uri) && !isRemoteMediaUri(localAudio.uri);
        audio = preferRemote ? m.audio : localAudio;
      }
      map.set(m.id, audio && audio !== m.audio ? { ...m, audio } : m);
    }
    for (const m of localMessages) {
      const prev = map.get(m.id);
      if (!prev) {
        map.set(m.id, m);
        continue;
      }
      const merged: ChatMessage = {
        ...prev,
        ...m,
        reference: m.reference ?? prev.reference,
      };
      if (m.reference && m.text != null) {
        merged.text = m.text;
      }
      if (m.attachments?.length) {
        merged.attachments = m.attachments.map((att, index) => {
          const prevAtt = prev.attachments?.[index];
          const uri =
            isRemoteMediaUri(prevAtt?.uri) && !isRemoteMediaUri(att.uri)
              ? prevAtt!.uri
              : att.uri ?? prevAtt?.uri;
          return uri ? { ...att, uri } : att;
        });
      }
      map.set(m.id, merged);
    }

    const ordered: ChatMessage[] = firestoreMessages
      .map((m) => map.get(m.id))
      .filter((m): m is ChatMessage => m != null);

    const firestoreIds = new Set(firestoreMessages.map((m) => m.id));
    for (const m of localMessages) {
      if (!firestoreIds.has(m.id)) ordered.push(map.get(m.id) ?? m);
    }

    return normalizeMessagesForDisplay(ordered);
  }, [cloudEnabled, firestoreMessages, localAudioByMessageId, localMessages]);

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
  }, [activeSessionId, activeTimeline, archivedBranch, branchPoint, messages, persistBranchForSession]);

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
    [cloudEnabled, recentsList],
  );

  /** Resposta completa de uma vez — sem streaming palavra a palavra. */
  const deliverLunaReply = useCallback(
    (reply: string, lunaMessageId: string, persist?: { uid: string; sessionId: string }) => {
      const lunaMsg: ChatMessage = { id: lunaMessageId, role: 'luna', text: reply };
      setLocalMessages((m) => {
        if (m.some((msg) => msg.id === lunaMessageId)) {
          return m.map((msg) => (msg.id === lunaMessageId ? lunaMsg : msg));
        }
        return [...m, lunaMsg];
      });
      setLoading(false);
      if (persist) {
        void writeLunaTextMessage(persist.uid, persist.sessionId, lunaMessageId, reply).catch(() => {
          /* mantém mensagem local como fallback */
        });
      }
    },
    [],
  );

  const deliverLunaError = useCallback(
    (err: unknown) => {
      const text =
        err instanceof LunaApiError
          ? err.message
          : 'Algo deu errado ao falar com a Luna. Tente novamente.';
      deliverLunaReply(text, `l${Date.now()}`);
    },
    [deliverLunaReply],
  );

  /** Atualiza uma mensagem em ambas as listas (local + firestore) por id. */
  const updateMessageById = useCallback(
    (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setLocalMessages((current) =>
        current.some((m) => m.id === messageId)
          ? current.map((msg) => (msg.id === messageId ? updater(msg) : msg))
          : current,
      );
      setFirestoreMessages((current) =>
        current.some((m) => m.id === messageId)
          ? current.map((msg) => (msg.id === messageId ? updater(msg) : msg))
          : current,
      );
    },
    [],
  );

  const callLuna = useCallback(
    async (message: string, userMessageId: string) => {
      const sessionId = ensureSessionId();
      const lunaMessageId = `l-${sessionId}-${Date.now()}`;
      setLoading(true);

      const idToken = cloudEnabled ? await auth.getIdToken() : null;

      try {
        const result = await lunaChat({
          message,
          sessionId,
          userMessageId,
          lunaMessageId,
          idToken,
          ...(legacyApi
            ? {}
            : {
                providerId: lunaProvider.providerId,
                modelKey: lunaProvider.modelKey,
              }),
        });
        sessionIdRef.current = result.sessionId;
        if (result.providerReason) {
          setLastRouting(result.providerReason);
        }
        deliverLunaReply(
          result.text,
          lunaMessageId,
          cloudEnabled && auth.uid
            ? { uid: auth.uid, sessionId: result.sessionId }
            : undefined,
        );
      } catch (err) {
        setLoading(false);
        deliverLunaError(err);
      }
    },
    [auth, cloudEnabled, ensureSessionId, deliverLunaError, deliverLunaReply, lunaProvider, legacyApi, setLastRouting],
  );

  const submitPayload = useCallback(
    (payload: ComposerSendPayload) => {
      const ref = messageReference;
      const clean = payload.text.trim();
      const attachments = payload.attachments;
      if (loading || (!clean && !ref && attachments.length === 0)) return;

      const isBranchContinuation = branchPoint != null && messages.length === branchPoint;
      const userMsgId = newMessageId('u');
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        text: clean || undefined,
        attachments: attachments.length > 0 ? attachments.map((a) => ({ ...a })) : undefined,
        reference: ref ?? undefined,
      };

      let apiText = clean;
      const imageAttachments = attachments.filter((a) => a.kind === 'image' && a.uri);
      const fileAttachments = attachments.filter(
        (a) => a.kind === 'file' && a.uri && isReadableDocumentAttachment(a),
      );
      const needsEnrichment = imageAttachments.length > 0 || fileAttachments.length > 0;
      const firestoreText = clean || attachmentsPreviewLabel(attachments);

      setLocalMessages((m) => [...m, userMsg]);

      void clearDraft();
      clearMessageReference();
      if (isBranchContinuation) {
        setMessageFeedback(feedbackForBranchContinuation());
      }

      void (async () => {
        try {
          if (cloudEnabled && auth.uid) {
            const uid = auth.uid;
            const sessionId = ensureSessionId();
            let persistedAttachments = userMsg.attachments;
            if (attachments.length > 0) {
              persistedAttachments = await uploadChatAttachments(
                uid,
                sessionId,
                userMsgId,
                attachments.map((a) => ({ ...a })),
              );
              updateMessageById(userMsgId, (msg) => ({
                ...msg,
                attachments: persistedAttachments,
              }));
            }
            await writeUserTextMessage(
              uid,
              sessionId,
              userMsgId,
              firestoreText,
              ref ?? undefined,
              persistedAttachments,
            );
          }

          if (attachments.length > 0) {
            if (needsEnrichment) {
              setLoading(true);
              const tokenGetter = cloudEnabled ? () => auth.getIdToken() : undefined;
              const [visionByUri, textByUri] = await Promise.all([
                imageAttachments.length > 0
                  ? describeImageAttachmentsSafe(imageAttachments, {
                      userPrompt: clean || undefined,
                      getIdToken: tokenGetter,
                    })
                  : Promise.resolve({} as Record<string, string>),
                fileAttachments.length > 0
                  ? extractDocumentAttachmentsSafe(fileAttachments, { getIdToken: tokenGetter })
                  : Promise.resolve({} as Record<string, string>),
              ]);
              apiText = formatAttachmentsForLunaApi(
                attachments,
                { visionByUri, textByUri },
                clean,
              );
            } else {
              const attBlock = formatAttachmentsForApi(attachments);
              apiText = apiText ? `${apiText}\n\n${attBlock}` : attBlock;
            }
          }
          if (!apiText.trim()) {
            apiText = attachmentsPreviewLabel(attachments);
          }
          if (ref) apiText = formatMessageWithReference(apiText, ref);
          await callLuna(apiText, userMsgId);
        } catch (err) {
          setLoading(false);
          deliverLunaError(err);
        }
      })();
    },
    [
      auth,
      auth.uid,
      branchPoint,
      callLuna,
      clearDraft,
      clearMessageReference,
      cloudEnabled,
      deliverLunaError,
      ensureSessionId,
      loading,
      messageReference,
      messages.length,
      updateMessageById,
    ],
  );

  const submit = useCallback(
    (text: string) => submitPayload({ text, attachments: [] }),
    [submitPayload],
  );

  const submitVoice = useCallback(
    (clip: VoiceClip) => {
      if (loading) return;
      const ref = messageReference;
      const userMsgId = newMessageId('u');
      const dur = formatVoiceDuration(clip.durationMs);
      const placeholder = `[Mensagem de voz — ${dur}]`;
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        audio: clip,
        transcriptLoading: true,
        reference: ref ?? undefined,
      };

      if (cloudEnabled && auth.uid) {
        setLocalMessages((m) => [...m, userMsg]);
        setLocalAudioByMessageId((prev) => ({ ...prev, [userMsgId]: clip }));
        void (async () => {
          try {
            const uid = auth.uid!;
            const sessionId = ensureSessionId();
            const cloudClip = await uploadVoiceClip(uid, sessionId, userMsgId, clip);
            setLocalAudioByMessageId((prev) => ({ ...prev, [userMsgId]: cloudClip }));
            updateMessageById(userMsgId, (msg) => ({ ...msg, audio: cloudClip }));
            await writeUserVoiceMessage(
              uid,
              sessionId,
              userMsgId,
              cloudClip,
              placeholder,
              ref ?? undefined,
            );
          } catch {
            await writeUserVoiceMessage(
              auth.uid!,
              ensureSessionId(),
              userMsgId,
              clip,
              placeholder,
              ref ?? undefined,
            ).catch(() => {
              /* mensagem otimista já visível */
            });
          }
        })();
      } else {
        setLocalMessages((m) => [...m, userMsg]);
      }

      void clearDraft();
      clearMessageReference();

      // Transcreve o áudio primeiro; só então a Luna recebe o texto real.
      setLoading(true);
      void transcribeVoiceClip(clip, auth.getIdToken)
        .then((text) => {
          updateMessageById(userMsgId, (msg) => ({
            ...msg,
            transcript: text,
            transcriptLoading: false,
            transcriptError: undefined,
          }));
          if (cloudEnabled && auth.uid && sessionIdRef.current) {
            void updateMessageTranscript(auth.uid, sessionIdRef.current, userMsgId, text);
          }
          const apiText = ref ? formatMessageWithReference(text, ref) : text;
          void callLuna(apiText, userMsgId);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Não foi possível transcrever.';
          updateMessageById(userMsgId, (msg) => ({
            ...msg,
            transcriptLoading: false,
            transcriptError: message,
          }));
          setLoading(false);
          deliverLunaError(new LunaApiError(`Não consegui entender o áudio: ${message}`));
        });
    },
    [
      auth.getIdToken,
      auth.uid,
      callLuna,
      clearDraft,
      clearMessageReference,
      cloudEnabled,
      deliverLunaError,
      ensureSessionId,
      loading,
      messageReference,
      updateMessageById,
    ],
  );

  const bumpThreadEnter = useCallback((quick: boolean) => {
    setThreadEnter((prev) => ({
      key: prev.key + 1,
      mode: quick ? 'pushQuick' : 'push',
    }));
  }, []);

  const openSession = useCallback(
    (id: string) => {
      void flush();
      hapticScreenPush();

      if (id === activeSessionId && sessionIdRef.current === id) {
        setHydrating(false);
        bumpThreadEnter(true);
        setScreen('thread');
        return;
      }

      resetBranchState();
      clearMessageReference();

      sessionIdRef.current = id;
      setActiveSessionId(id);
      setLocalMessages([]);
      setLocalAudioByMessageId({});

      const warm = getWarmSnapshot(id);
      const recentTitle = recentsList.find((s) => s.id === id)?.title;
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
      bumpThreadEnter(false);
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

  const startNewChat = useCallback(() => {
    void flush();
    hapticScreenPush();
    resetBranchState();
    clearMessageReference();
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

  const backToHome = useCallback(() => {
    hapticScreenPop();
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

  const sendFromThread = useCallback(
    (payload: ComposerSendPayload) => submitPayload(payload),
    [submitPayload],
  );

  const sendFromHome = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    await clearDraft();
    startNewChat();
    submit(text);
  }, [draft, clearDraft, startNewChat, submit]);

  const sendSuggestion = useCallback(
    (text: string) => {
      startNewChat();
      setTimeout(() => submit(text), 30);
    },
    [startNewChat, submit],
  );

  const sendVoiceMessage = useCallback(
    (clip: VoiceClip) => {
      if (loading) return;
      if (screen === 'home') {
        startNewChat();
        setTimeout(() => submitVoice(clip), 30);
      } else {
        submitVoice(clip);
      }
    },
    [loading, screen, startNewChat, submitVoice],
  );

  const requestTranscript = useCallback(
    (messageId: string) => {
      const list = cloudEnabled ? firestoreMessages : localMessages;
      const target = list.find((m) => m.id === messageId);
      if (!target?.audio || target.transcript || target.transcriptLoading) return;

      const audio = target.audio;
      updateMessageById(messageId, (msg) => ({
        ...msg,
        transcriptLoading: true,
        transcriptError: undefined,
      }));

      void transcribeVoiceClip(audio, auth.getIdToken)
        .then((text) => {
          updateMessageById(messageId, (msg) => ({
            ...msg,
            transcript: text,
            transcriptLoading: false,
            transcriptError: undefined,
          }));
          if (cloudEnabled && auth.uid && sessionIdRef.current) {
            void updateMessageTranscript(auth.uid, sessionIdRef.current, messageId, text);
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Não foi possível transcrever.';
          updateMessageById(messageId, (msg) => ({
            ...msg,
            transcriptLoading: false,
            transcriptError: message,
          }));
        });
    },
    [auth.getIdToken, auth.uid, cloudEnabled, firestoreMessages, localMessages, updateMessageById],
  );

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

  const applyThreadPrefix = useCallback(
    (nextMessages: ChatMessage[]) => {
      if (cloudEnabled) {
        setFirestoreMessages(nextMessages);
      }
      setLocalMessages(nextMessages);
      setLocalAudioByMessageId((prev) => {
        const next: Record<string, VoiceClip> = {};
        for (const m of nextMessages) {
          if (prev[m.id]) next[m.id] = prev[m.id];
          else if (m.audio) next[m.id] = m.audio;
        }
        return next;
      });
    },
    [cloudEnabled],
  );

  const truncateThreadFromIndex = useCallback(
    async (index: number, composerDraft: string) => {
      const sid = activeSessionId ?? sessionIdRef.current;
      const tail = messages.slice(index);
      const keep = messages.slice(0, index);
      resetBranchState();
      if (sid) void saveBranchState(sid, null);
      applyThreadPrefix(keep);
      setDraft(composerDraft);
      setMessageFeedback(feedbackForTruncate(tail.length + 1));

      if (cloudEnabled && auth.uid && sid) {
        for (const m of tail) {
          void backupAndDeleteMessage(auth.uid, sid, m);
        }
      }
    },
    [activeSessionId, applyThreadPrefix, auth.uid, cloudEnabled, messages, resetBranchState, setDraft],
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
    [activeSessionId, applyThreadPrefix, bumpThreadEnter, flush, messages, resetBranchState, title],
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

      if (cloudEnabled && auth.uid && sid) {
        for (const m of archived.messages) {
          void backupAndDeleteMessage(auth.uid, sid, m);
        }
      }
    },
    [activeSessionId, applyThreadPrefix, auth.uid, cloudEnabled, messages, setDraft],
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
    [activeTimeline, applyThreadPrefix, archivedBranch, branchPoint, messages],
  );

  const openForkSource = useCallback(() => {
    if (!forkSource) return;
    openSession(forkSource.sessionId);
  }, [forkSource, openSession]);

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
      applyThreadPrefix,
      archivedBranch,
      branchPoint,
      messages,
      resetBranchState,
    ],
  );

  const runMessageAction = useCallback(
    async (action: MessageSheetAction, messageId: string, opts?: { focusComposer?: () => void }) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      switch (action) {
        case 'copy': {
          setMessageFeedback(await copyMessageAction(message));
          break;
        }
        case 'resend': {
          const plan = planResendMessage(message, messages);
          setMessageFeedback(plan.feedback);
          if (plan.resendUserText) {
            submit(plan.resendUserText);
          } else if (plan.composerDraft) {
            setDraft(plan.composerDraft);
            opts?.focusComposer?.();
          }
          break;
        }
        case 'redo': {
          if (message.role === 'luna') {
            const plan = planRedoLunaRegenerate(message, messages);
            setMessageFeedback(plan.feedback);
            if (plan.regenerateFromUserText) {
              void callLuna(plan.regenerateFromUserText, newMessageId('u'));
            }
          } else {
            const plan = planRedoMessage(message);
            setMessageFeedback(plan.feedback);
            if (plan.composerDraft) {
              setDraft(plan.composerDraft);
              opts?.focusComposer?.();
            }
          }
          break;
        }
        case 'fork': {
          if (message.role !== 'user') break;
          forkFromMessage(messageId, true);
          break;
        }
      }
    },
    [callLuna, forkFromMessage, messages, setDraft, submit],
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

      if (cloudEnabled && auth.uid) {
        setRecents((prev) => prev.filter((s) => s.id !== id));
        const result = await backupAndDeleteConversation(auth.uid, id);
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
      auth.uid,
      clearActiveSessionIfMatch,
      cloudEnabled,
      messages,
      recentsList,
      trashSessions,
    ],
  );

  const deleteForkBranch = useCallback(
    async (childSessionId: string, childTitle?: string) => {
      await removeForkLink(childSessionId);
      setForkLinks(await loadForkLinks());
      await deleteConversation(childSessionId);
      setMessageFeedback(feedbackForForkDeleted(childTitle));
    },
    [deleteConversation],
  );

  const restoreConversation = useCallback(
    async (id: string) => {
      if (cloudEnabled && auth.uid) {
        try {
          await restoreConversationFromTrash(auth.uid, id);
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
    [auth.uid, cloudEnabled],
  );

  const permanentDeleteTrash = useCallback(
    async (id: string) => {
      if (cloudEnabled && auth.uid) {
        try {
          await permanentlyDeleteFromTrash(auth.uid, id);
        } catch {
          setSyncError('Não foi possível apagar da lixeira.');
        }
        return;
      }
      await localTrashPermanentDelete(id);
      setTrashSessions(await localTrashList());
    },
    [auth.uid, cloudEnabled],
  );

  return {
    screen,
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
    setMessageFeedback,
    deleteConversation,
    restoreConversation,
    permanentDeleteTrash,
  };
}
