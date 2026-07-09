import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ChatMessage, VoiceClip } from './fixtures';
import { subscribeMessages } from '../lib/firebase/firestoreChat';
import { isRemoteMediaUri } from '../lib/firebase/uploadChatMedia';
import { releaseWarmForActive } from '../lib/conversationWarmCache';
import { mergeFirestoreAndLocalMessages } from '../lib/mergeChatMessages';
import { normalizeMessagesForDisplay } from '../lib/messageReference';
import type { ActiveTimeline, ArchivedBranch } from '../lib/branchState';

type BranchRefs = {
  branchPointRef: MutableRefObject<number | null>;
  activeTimelineRef: MutableRefObject<ActiveTimeline>;
  archivedBranchRef: MutableRefObject<ArchivedBranch | null>;
};

type UseChatMessagesParams = BranchRefs & {
  cloudEnabled: boolean;
  uid: string | null | undefined;
  activeSessionId: string | null;
  setSyncError: (message: string) => void;
};

/**
 * Estado e merge de mensagens (local + Firestore). O merge respeita um branch
 * arquivado ativo via refs (ainda vivem em useOrbitChat até a fase de branching
 * ser extraída) — por isso entram como parâmetro em vez de estado próprio.
 */
export function useChatMessages({
  cloudEnabled,
  uid,
  activeSessionId,
  setSyncError,
  branchPointRef,
  activeTimelineRef,
  archivedBranchRef,
}: UseChatMessagesParams) {
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessage[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const [localAudioByMessageId, setLocalAudioByMessageId] = useState<Record<string, VoiceClip>>({});

  useEffect(() => {
    if (!cloudEnabled || !uid || !activeSessionId) return;
    releaseWarmForActive(activeSessionId);
    return subscribeMessages(
      uid,
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
  }, [cloudEnabled, uid, activeSessionId, branchPointRef, activeTimelineRef, archivedBranchRef, setSyncError]);

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
        humor: m.humor ?? prev.humor,
      };
      if (m.streaming) {
        merged.streaming = true;
        merged.text = m.text ?? prev.text;
        merged.reasoning = m.reasoning ?? prev.reasoning;
        merged.reasoningStreaming = m.reasoningStreaming ?? prev.reasoningStreaming;
      } else if (m.reference && m.text != null) {
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

    const ordered = mergeFirestoreAndLocalMessages(firestoreMessages, localMessages, map);

    return normalizeMessagesForDisplay(ordered);
  }, [cloudEnabled, firestoreMessages, localAudioByMessageId, localMessages]);

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

  return {
    messages,
    localMessages,
    setLocalMessages,
    firestoreMessages,
    setFirestoreMessages,
    hydrating,
    setHydrating,
    localAudioByMessageId,
    setLocalAudioByMessageId,
    updateMessageById,
    applyThreadPrefix,
  };
}
