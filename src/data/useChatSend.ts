import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ChatMessage } from './fixtures';
import { newMessageId } from './messageId';
import { LunaApiError, lunaChatStream, lunaRosaryReflection } from './lunaClient';
import { argumentoDaAcao, ehFerramentaDePesquisa, type ResearchStep } from '../lib/researchTrace';
import type { LunaHumorBadge } from '../lib/lunaHumor';
import { feedbackQuotaExceeded } from '../features/billing/quotaUtils';
import { estimarCustoMinimoChat } from '../features/billing/tokenEstimate';
import { describeImageAttachmentsSafe } from './describeImageAttachments';
import { extractDocumentAttachmentsSafe } from './extractDocumentAttachments';
import { lunaMessageIdForUser } from '../lib/chatMessageIds';
import { writeLunaTextMessage, writeUserTextMessage } from '../lib/firebase/firestoreChat';
import { uploadChatAttachments } from '../lib/firebase/uploadChatMedia';
import { mergeUserMilestones } from '../lib/firebase/firestoreUserProfile';
import {
  attachmentsPreviewLabel,
  formatAttachmentsForApi,
  formatAttachmentsForLunaApi,
  type ComposerSendPayload,
} from '../lib/composerAttachmentModel';
import { isReadableDocumentAttachment } from '../lib/readableDocuments';
import { feedbackForBranchContinuation, type MessageActionFeedback } from '../lib/messageActions';
import { formatMessageWithReference, type ThreadReference } from '../lib/messageReference';
import { estimateFadeDrainMs, tokenizeStreamSegments } from '../lib/streamWordBuffer';
import { flushStreamRender } from '../lib/lunaSseClient';
import { looksLikeMarkdown } from '../components/chat/detectMarkdown';
import type { LunaProviderSelection, LunaReasoningEffort } from '../lib/lunaProviderSettings';
import type { LunaUsageContextValue } from '../hooks/LunaUsageContext';

const DEVICE_TIME_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
})();

async function getIdTokenComTimeout(
  getter: () => Promise<string | null>,
  ms = 15_000,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getter(),
      new Promise<null>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Sessão Firebase demorou demais. Reinicia o app.')),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type UseChatSendParams = {
  cloudEnabled: boolean;
  uid: string | null | undefined;
  getIdToken: () => Promise<string | null>;
  displayName: string;
  lunaProvider: LunaProviderSelection;
  reasoningEnabled: boolean;
  reasoningEffort: LunaReasoningEffort;
  legacyApi: boolean;
  setLastRouting: (reason: string | null) => void;
  lunaUsage: LunaUsageContextValue;
  blockIfQuotaExceeded: () => boolean;
  messageReference: ThreadReference | null;
  clearMessageReference: () => void;
  ensureSessionId: () => string;
  sessionIdRef: MutableRefObject<string | null>;
  messages: ChatMessage[];
  branchPoint: number | null;
  setLocalMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  updateMessageById: (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  loading: boolean;
  setLoading: (value: boolean) => void;
  setLunaHumorAtual: (humor: LunaHumorBadge | null) => void;
  setMessageFeedback: (feedback: MessageActionFeedback) => void;
  draft: string;
  clearDraft: () => Promise<void> | void;
  startNewChat: () => void;
};

/**
 * Envio de mensagens (texto, anexos, rosário) e a resposta da Luna, incluindo
 * o streaming simulado no cliente. `startNewChat` continua em useOrbitChat —
 * mexe em navegação e branching, domínios que ainda não são deste hook — por
 * isso entra injetado, no mesmo padrão de DI das fases anteriores.
 */
export function useChatSend({
  cloudEnabled,
  uid,
  getIdToken,
  displayName,
  lunaProvider,
  reasoningEnabled,
  reasoningEffort,
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
}: UseChatSendParams) {
  const aplicarHumorResposta = useCallback(
    (humor: LunaHumorBadge | undefined, lunaMessageId: string) => {
      if (!humor) return;
      setLunaHumorAtual(humor);
      setLocalMessages((current) =>
        current.map((msg) => (msg.id === lunaMessageId ? { ...msg, humor } : msg)),
      );
    },
    [setLocalMessages, setLunaHumorAtual],
  );

  /** Resposta completa de uma vez — sem streaming palavra a palavra. */
  const deliverLunaReply = useCallback(
    (reply: string, lunaMessageId: string, persist?: { uid: string; sessionId: string }) => {
      const lunaMsg: ChatMessage = { id: lunaMessageId, role: 'luna', text: reply };
      // loading=false antes da bolha — evita “pensando” + resposta ao mesmo tempo
      setLoading(false);
      setLocalMessages((m) => {
        if (m.some((msg) => msg.id === lunaMessageId)) {
          return m.map((msg) => (msg.id === lunaMessageId ? lunaMsg : msg));
        }
        return [...m, lunaMsg];
      });
      if (persist) {
        void writeLunaTextMessage(persist.uid, persist.sessionId, lunaMessageId, reply).catch(() => {
          /* mantém mensagem local como fallback */
        });
      }
    },
    [setLoading, setLocalMessages],
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

  const callLuna = useCallback(
    async (message: string, userMessageId: string) => {
      if (blockIfQuotaExceeded()) return;

      const sessionId = ensureSessionId();
      const lunaMessageId = lunaMessageIdForUser(userMessageId);
      setLoading(true);

      let idToken: string | null = null;
      if (cloudEnabled) {
        try {
          idToken = await getIdTokenComTimeout(getIdToken);
        } catch (err) {
          setLoading(false);
          deliverLunaError(err);
          return;
        }
      }
      const chatRequest = {
        message,
        sessionId,
        userMessageId,
        lunaMessageId,
        idToken,
        userDisplayName: displayName,
        timeZone: DEVICE_TIME_ZONE,
        reasoningEnabled,
        reasoningEffort,
        ...(legacyApi
          ? {}
          : {
              providerId: lunaProvider.providerId,
              modelKey: lunaProvider.modelKey,
            }),
      };

      const upsertMessageById = (id: string, patch: Partial<ChatMessage>) => {
        setLocalMessages((m) => {
          const existing = m.find((msg) => msg.id === id);
          const base: ChatMessage = existing ?? {
            id,
            role: 'luna',
            text: '',
            streaming: true,
          };
          const next: ChatMessage = { ...base, ...patch };
          if (existing) return m.map((msg) => (msg.id === id ? next : msg));
          return [...m, next];
        });
      };
      const upsertStreamMessage = (patch: Partial<ChatMessage>) =>
        upsertMessageById(lunaMessageId, patch);

      // Reserva o slot da Luna logo após o envio — ordem correta mesmo antes da API responder.
      upsertStreamMessage({ text: '', streaming: true });

      let bumpedTokens = 0;
      if (cloudEnabled && uid && !lunaUsage.isReducedMode) {
        bumpedTokens = estimarCustoMinimoChat(message, 0);
        lunaUsage.bumpTokens(bumpedTokens);
      }

      let streamErrorMessage: string | null = null;
      const steps: ResearchStep[] = [];
      let reasoningText = '';

      try {
        // Streaming SSE — traz eventos de ação (pesquisa web / leitura de link) e
        // raciocínio ao vivo. O texto final chega inteiro no evento `done`; o
        // efeito de revelação palavra a palavra continua sendo simulado no
        // cliente logo abaixo.
        const result = await lunaChatStream(chatRequest, {
          onError: (message) => {
            streamErrorMessage = message;
          },
          onReasoningDelta: (delta) => {
            reasoningText += delta;
            upsertStreamMessage({ reasoning: reasoningText, reasoningStreaming: true });
          },
          onAcao: (acao) => {
            if (!ehFerramentaDePesquisa(acao.ferramenta)) return;
            const argumento = argumentoDaAcao(acao.ferramenta, acao.argumentos);
            if (acao.tipo === 'inicio_ferramenta') {
              upsertStreamMessage({
                researchLive: {
                  ferramenta: acao.ferramenta,
                  argumento,
                  rodada: acao.rodada,
                  maxRodadas: acao.maxRodadas,
                },
              });
              return;
            }
            steps.push({
              ferramenta: acao.ferramenta,
              argumento,
              sucesso: acao.sucesso,
              fontes: acao.fontes,
            });
            upsertStreamMessage({ researchLive: undefined, research: [...steps] });
          },
        });
        sessionIdRef.current = result.sessionId;
        if (result.providerReason) {
          setLastRouting(result.providerReason);
        }

        setLoading(false);
        upsertStreamMessage({ text: result.text, streaming: true, reasoningStreaming: false });
        await flushStreamRender();
        await new Promise<void>((resolve) => {
          setTimeout(resolve, estimateFadeDrainMs(result.text));
        });

        const format = looksLikeMarkdown(result.text) ? ('markdown' as const) : undefined;
        upsertStreamMessage({
          text: result.text,
          streaming: false,
          format,
          humor: result.humor_atual,
        });
        aplicarHumorResposta(result.humor_atual, lunaMessageId);

        if (cloudEnabled && uid) {
          if (!result.idempotent) {
            void writeLunaTextMessage(uid, result.sessionId, lunaMessageId, result.text, steps).catch(
              () => {},
            );
          }
          if (bumpedTokens > 0 && result.idempotent) {
            lunaUsage.rollbackTokens(bumpedTokens);
          }
          void lunaUsage.refreshUsage();
        }
      } catch (err) {
        setLoading(false);
        setLocalMessages((m) => m.filter((msg) => msg.id !== lunaMessageId));
        if (bumpedTokens > 0) {
          lunaUsage.rollbackTokens(bumpedTokens);
        }
        if (err instanceof LunaApiError && err.code === 'quota_exceeded') {
          setMessageFeedback(feedbackQuotaExceeded(lunaUsage.usage));
        }
        const effectiveErr =
          streamErrorMessage && err instanceof LunaApiError && !err.code
            ? new LunaApiError(streamErrorMessage)
            : err;
        deliverLunaError(effectiveErr);
      }
    },
    [
      aplicarHumorResposta,
      blockIfQuotaExceeded,
      cloudEnabled,
      deliverLunaError,
      displayName,
      ensureSessionId,
      getIdToken,
      legacyApi,
      lunaProvider,
      lunaUsage,
      sessionIdRef,
      setLastRouting,
      setLoading,
      setLocalMessages,
      setMessageFeedback,
      uid,
    ],
  );

  const submitPayload = useCallback(
    (payload: ComposerSendPayload) => {
      const ref = messageReference;
      const clean = payload.text.trim();
      const attachments = payload.attachments;
      if (loading || (!clean && !ref && attachments.length === 0)) return;
      if (blockIfQuotaExceeded()) return;

      const imageAttachments = attachments.filter((a) => a.kind === 'image' && a.uri);
      const fileAttachments = attachments.filter(
        (a) => a.kind === 'file' && a.uri && isReadableDocumentAttachment(a),
      );

      if (imageAttachments.length > 0 && !lunaUsage.canAnalyzeImages(imageAttachments.length)) {
        setMessageFeedback(feedbackQuotaExceeded(lunaUsage.usage));
        return;
      }
      if (fileAttachments.length > 0 && !lunaUsage.canExtractDocuments(fileAttachments.length)) {
        setMessageFeedback(feedbackQuotaExceeded(lunaUsage.usage));
        return;
      }

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
          // 1. Enriquecer anexos antes de qualquer upload — no Android a URI do cache pode expirar rapidamente.
          if (attachments.length > 0 && needsEnrichment) {
            setLoading(true);
            const tokenGetter = cloudEnabled ? getIdToken : undefined;
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
            apiText = formatAttachmentsForLunaApi(attachments, { visionByUri, textByUri }, clean);
          } else if (attachments.length > 0) {
            const attBlock = formatAttachmentsForApi(attachments);
            apiText = apiText ? `${apiText}\n\n${attBlock}` : attBlock;
          }
          if (!apiText.trim()) {
            apiText = attachmentsPreviewLabel(attachments);
          }
          if (ref) apiText = formatMessageWithReference(apiText, ref);

          if (cloudEnabled && uid) {
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

            const milestonePatch: Parameters<typeof mergeUserMilestones>[1] = {};
            if (imageAttachments.length > 0) milestonePatch.imageAttachment = true;
            if (fileAttachments.length > 0) milestonePatch.fileAttachment = true;
            if (ref?.kind === 'document') milestonePatch.documentReference = true;
            if (Object.keys(milestonePatch).length > 0) {
              void mergeUserMilestones(uid, milestonePatch);
            }
          }

          await callLuna(apiText, userMsgId);
        } catch (err) {
          setLoading(false);
          deliverLunaError(err);
        }
      })();
    },
    [
      blockIfQuotaExceeded,
      branchPoint,
      callLuna,
      clearDraft,
      clearMessageReference,
      cloudEnabled,
      deliverLunaError,
      ensureSessionId,
      getIdToken,
      loading,
      lunaUsage,
      messageReference,
      messages.length,
      setLoading,
      setLocalMessages,
      setMessageFeedback,
      uid,
      updateMessageById,
    ],
  );

  const submit = useCallback(
    (text: string) => submitPayload({ text, attachments: [] }),
    [submitPayload],
  );

  const sendRosaryMessage = useCallback(
    async (userText: string | undefined, lunaText: string) => {
      const sessionId = ensureSessionId();
      const userMsgId = userText ? newMessageId('u') : undefined;
      const lunaMsgId = newMessageId('l');

      if (userText && userMsgId) {
        const userMsg: ChatMessage = { id: userMsgId, role: 'user', text: userText.trim() };
        setLocalMessages((m) => [...m, userMsg]);
        if (cloudEnabled && uid) {
          await writeUserTextMessage(uid, sessionId, userMsgId, userText.trim());
        }
      }

      const fullText = lunaText.trim();
      const segments = tokenizeStreamSegments(fullText);
      const upsertRosaryMessage = (patch: Partial<ChatMessage>) => {
        setLocalMessages((m) => {
          const existing = m.find((msg) => msg.id === lunaMsgId);
          const base: ChatMessage = existing ?? {
            id: lunaMsgId,
            role: 'luna',
            text: '',
            streaming: true,
          };
          const next: ChatMessage = { ...base, ...patch };
          if (existing) return m.map((msg) => (msg.id === lunaMsgId ? next : msg));
          return [...m, next];
        });
      };

      upsertRosaryMessage({ text: '', streaming: true });

      // Revelação palavra por palavra para imitar streaming da Luna.
      const staggerMs = 30;
      let currentText = '';
      for (let i = 0; i < segments.length; i += 1) {
        currentText += segments[i];
        upsertRosaryMessage({ text: currentText, streaming: true });
        await new Promise<void>((resolve) => setTimeout(resolve, staggerMs));
      }

      await flushStreamRender();
      await new Promise<void>((resolve) => setTimeout(resolve, estimateFadeDrainMs(fullText)));
      upsertRosaryMessage({ text: fullText, streaming: false });

      if (cloudEnabled && uid) {
        await writeLunaTextMessage(uid, sessionId, lunaMsgId, fullText);
      }
    },
    [cloudEnabled, ensureSessionId, setLocalMessages, uid],
  );

  const sendRosaryReflection = useCallback(
    async (input: { mysteryName: string; mysterySetLabel: string; intention?: string }) => {
      const token = await getIdToken();
      const text = await lunaRosaryReflection(input, token);
      await sendRosaryMessage(undefined, text);
    },
    [getIdToken, sendRosaryMessage],
  );

  const sendFromThread = useCallback(
    (payload: ComposerSendPayload) => submitPayload(payload),
    [submitPayload],
  );

  const sendFromHome = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    if (blockIfQuotaExceeded()) return;
    await clearDraft();
    startNewChat();
    submit(text);
  }, [blockIfQuotaExceeded, clearDraft, draft, startNewChat, submit]);

  const sendSuggestion = useCallback(
    (text: string) => {
      if (blockIfQuotaExceeded()) return;
      startNewChat();
      setTimeout(() => submit(text), 30);
    },
    [blockIfQuotaExceeded, startNewChat, submit],
  );

  return {
    callLuna,
    deliverLunaError,
    submit,
    sendFromThread,
    sendFromHome,
    sendSuggestion,
    sendRosaryMessage,
    sendRosaryReflection,
  };
}
