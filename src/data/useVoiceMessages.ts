import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ChatMessage, VoiceClip } from './fixtures';
import { LunaApiError } from './lunaClient';
import { newMessageId } from './messageId';
import { lunaMessageIdForUser } from '../lib/chatMessageIds';
import { transcribeVoiceClip } from './transcribeVoice';
import { formatVoiceDuration } from '../hooks/useVoiceRecording';
import type { LunaUsageContextValue } from '../hooks/LunaUsageContext';
import { feedbackQuotaExceeded } from '../features/billing/quotaUtils';
import { updateMessageTranscript, writeUserVoiceMessage } from '../lib/firebase/firestoreChat';
import { uploadVoiceClip } from '../lib/firebase/uploadChatMedia';
import { mergeUserMilestones } from '../lib/firebase/firestoreUserProfile';
import { formatMessageWithReference, type ThreadReference } from '../lib/messageReference';

type UseVoiceMessagesParams = {
  loading: boolean;
  screen: 'home' | 'thread';
  startNewChat: () => void;
  cloudEnabled: boolean;
  uid: string | null | undefined;
  getIdToken: () => Promise<string | null>;
  lunaUsage: LunaUsageContextValue;
  blockIfQuotaExceeded: () => boolean;
  messageReference: ThreadReference | null;
  clearMessageReference: () => void;
  setMessageFeedback: (feedback: ReturnType<typeof feedbackQuotaExceeded>) => void;
  setLocalMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLocalAudioByMessageId: Dispatch<SetStateAction<Record<string, VoiceClip>>>;
  updateMessageById: (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  firestoreMessages: ChatMessage[];
  localMessages: ChatMessage[];
  ensureSessionId: () => string;
  sessionIdRef: MutableRefObject<string | null>;
  clearDraft: () => Promise<void> | void;
  setLoading: (value: boolean) => void;
  callLuna: (message: string, userMessageId: string) => Promise<void>;
  deliverLunaError: (err: unknown, lunaMessageId: string) => void;
};

/**
 * Envio e transcrição de mensagens de voz. `submitVoice` fica interno (só
 * `sendVoiceMessage` chama) no mesmo padrão de `submitPayload` na fase 4 —
 * depende de `callLuna`/`deliverLunaError` injetados do useChatSend.
 */
export function useVoiceMessages({
  loading,
  screen,
  startNewChat,
  cloudEnabled,
  uid,
  getIdToken,
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
}: UseVoiceMessagesParams) {
  const submitVoice = useCallback(
    (clip: VoiceClip) => {
      if (loading) return;
      if (!lunaUsage.canTranscribeVoice()) {
        setMessageFeedback(feedbackQuotaExceeded(lunaUsage.usage));
        return;
      }
      if (blockIfQuotaExceeded()) return;
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

      if (cloudEnabled && uid) {
        setLocalMessages((m) => [...m, userMsg]);
        setLocalAudioByMessageId((prev) => ({ ...prev, [userMsgId]: clip }));
        void (async () => {
          try {
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
            void mergeUserMilestones(uid, { voiceMessage: true });
          } catch {
            await writeUserVoiceMessage(
              uid,
              ensureSessionId(),
              userMsgId,
              clip,
              placeholder,
              ref ?? undefined,
            ).catch(() => {
              /* mensagem otimista já visível */
            });
            void mergeUserMilestones(uid, { voiceMessage: true });
          }
        })();
      } else {
        setLocalMessages((m) => [...m, userMsg]);
      }

      void clearDraft();
      clearMessageReference();

      // Transcreve o áudio primeiro; só então a Luna recebe o texto real.
      setLoading(true);
      void transcribeVoiceClip(clip, getIdToken)
        .then((text) => {
          updateMessageById(userMsgId, (msg) => ({
            ...msg,
            transcript: text,
            transcriptLoading: false,
            transcriptError: undefined,
          }));
          if (cloudEnabled && uid && sessionIdRef.current) {
            void updateMessageTranscript(uid, sessionIdRef.current, userMsgId, text);
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
          deliverLunaError(
            new LunaApiError(`Não consegui entender o áudio: ${message}`),
            lunaMessageIdForUser(userMsgId),
          );
        });
    },
    [
      getIdToken,
      uid,
      blockIfQuotaExceeded,
      callLuna,
      clearDraft,
      clearMessageReference,
      cloudEnabled,
      deliverLunaError,
      ensureSessionId,
      loading,
      lunaUsage,
      messageReference,
      updateMessageById,
    ],
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

      void transcribeVoiceClip(audio, getIdToken)
        .then((text) => {
          updateMessageById(messageId, (msg) => ({
            ...msg,
            transcript: text,
            transcriptLoading: false,
            transcriptError: undefined,
          }));
          if (cloudEnabled && uid && sessionIdRef.current) {
            void updateMessageTranscript(uid, sessionIdRef.current, messageId, text);
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
    [getIdToken, uid, cloudEnabled, firestoreMessages, localMessages, updateMessageById],
  );

  return {
    sendVoiceMessage,
    requestTranscript,
  };
}
