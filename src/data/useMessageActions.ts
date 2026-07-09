import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { ChatMessage } from './fixtures';
import { newMessageId } from './messageId';
import { backupAndDeleteMessage } from '../lib/firebase/firestoreTrash';
import { saveBranchState } from '../lib/branchStorage';
import {
  copyMessageAction,
  feedbackForTruncate,
  planRedoLunaRegenerate,
  planRedoMessage,
  planResendMessage,
  type MessageActionFeedback,
  type MessageSheetAction,
} from '../lib/messageActions';

type UseMessageActionsParams = {
  activeSessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  cloudEnabled: boolean;
  uid: string | null | undefined;
  messages: ChatMessage[];
  applyThreadPrefix: (nextMessages: ChatMessage[]) => void;
  resetBranchState: () => void;
  setDraft: (text: string) => void;
  setMessageFeedback: (feedback: MessageActionFeedback) => void;
  submit: (text: string) => void;
  callLuna: (message: string, userMessageId: string) => Promise<void>;
  forkFromMessage: (messageId: string, includeMessage: boolean) => void;
};

/**
 * Ações do menu de mensagem (copiar, reenviar, redo, fork) e o "apagar dali
 * pra frente". Depende de submit/callLuna/forkFromMessage já injetados de
 * outros domínios — mesmo padrão de DI das fases anteriores.
 */
export function useMessageActions({
  activeSessionId,
  sessionIdRef,
  cloudEnabled,
  uid,
  messages,
  applyThreadPrefix,
  resetBranchState,
  setDraft,
  setMessageFeedback,
  submit,
  callLuna,
  forkFromMessage,
}: UseMessageActionsParams) {
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

      if (cloudEnabled && uid && sid) {
        for (const m of tail) {
          void backupAndDeleteMessage(uid, sid, m);
        }
      }
    },
    [activeSessionId, applyThreadPrefix, uid, cloudEnabled, messages, resetBranchState, sessionIdRef, setDraft, setMessageFeedback],
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
    [callLuna, forkFromMessage, messages, setDraft, setMessageFeedback, submit],
  );

  return {
    runMessageAction,
    truncateThreadFromIndex,
  };
}
