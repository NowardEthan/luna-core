import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { ThreadHeaderMenu, type ThreadMenuItem } from '../components/ThreadHeaderMenu';
import { formatConversationForExport } from '../lib/exportConversation';
import { BranchContinuationMarker } from '../components/BranchContinuationMarker';
import type { BranchNavigatorAction } from '../components/BranchNavigatorSheet';
import { BranchNavigatorSheet } from '../components/BranchNavigatorSheet';
import type { ActiveTimeline, ArchivedBranch, ForkSource } from '../lib/branchState';
import { inactiveTimelineLabel } from '../lib/branchState';
import type { ForkLink } from '../lib/branchStorage';
import { ThreadScrollToBottomFab } from '../components/ThreadScrollToBottomFab';
import { ThreadBranchPill } from '../components/ThreadBranchPill';
import { Composer, type ComposerHandle } from '../components/Composer';
import { ForkSourceBanner } from '../components/ForkSourceBanner';
import { MessageArchivedBranch } from '../components/MessageArchivedBranch';
import { ComposerDock } from '../components/ComposerDock';
import { LunaAvatar } from '../components/LunaAvatar';
import { LunaThinking } from '../components/LunaThinking';
import { SkeletonMessageList } from '../components/Skeleton';
import { LunaProfileSheet } from '../components/LunaProfileSheet';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { MessageActionToast } from '../components/MessageActionToast';
import { RosarySessionHud } from '../components/RosarySessionHud';
import { MessageBubble } from '../components/MessageBubble';
import { MessageRedoChoiceSheet } from '../components/MessageRedoChoiceSheet';
import { ChatMessage, VoiceClip } from '../data/fixtures';
import type { ComposerSendPayload } from '../lib/composerAttachmentModel';
import { useFrozenWhenHidden } from '../hooks/useNavigationPerf';
import { useMotionProfile } from '../hooks/useMotionProfile';
import {
  threadRowFirstInGroup,
  useProgressiveThreadWindow,
} from '../hooks/useProgressiveThreadWindow';
import { useKeyboardOpen } from '../hooks/useKeyboardBottomInset';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { UsageLimitChip } from '../components/billing/UsageLimitChip';
import { quotaComposerPlaceholder } from '../features/billing/limitsSummary';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { hapticLongPress, hapticListTap } from '../lib/haptics';
import { QuotePickOverlay } from '../components/QuotePickOverlay';
import {
  AttachmentPreviewModal,
  type AttachmentPreviewTarget,
} from '../components/AttachmentPreviewModal';
import {
  buildDocumentReference,
  buildMessageReference,
  feedbackForReference,
  findAttachmentForReference,
  isDocumentReference,
  type ThreadReference,
} from '../lib/messageReference';
import { redoUserNeedsChoice, type MessageSheetAction } from '../lib/messageActions';
import type { MessageActionFeedback } from '../lib/messageActions';
import type { RedoUserChoice } from '../lib/messageActions';
import type { LunaHumorBadge as LunaHumorBadgeType } from '../lib/lunaHumor';
import { tokens } from '../theme/tokens';
import { layout } from '../theme/layout';
import { type } from '../theme/typography';

const REFERENCE_HIGHLIGHT_MS = 2800;
const SCROLL_AWAY_THRESHOLD = 88;

type ReferenceHighlight = {
  messageId: string;
  excerpt: string;
};

interface Props {
  title: string;
  sessionKey: string | null;
  threadVisible: boolean;
  hydrating: boolean;
  messages: ChatMessage[];
  loading: boolean;
  draft: string;
  messageFeedback: MessageActionFeedback | null;
  onChange: (t: string) => void;
  onSend: (payload: ComposerSendPayload) => void;
  onRosaryToggle?: () => void;
  onRosaryLongPress?: () => void;
  onRosaryReflection?: () => void;
  onRosaryToggleMode?: () => void;
  onRosaryStop?: () => void;
  rosaryState?: import('../hooks/useRosary').RosaryState;
  rosaryPlaceholder?: string;
  rosaryBeadCurrent?: number;
  rosaryBeadTotal?: number;
  rosaryMode?: import('../hooks/useRosary').PrayerMode | null;
  onBack: () => void;
  quickMenuOpen: boolean;
  onQuickMenuToggle: () => void;
  /** Inicia uma nova conversa (item do menu ⋮ do header). */
  onNewChat?: () => void;
  onVoiceSend: (clip: VoiceClip) => void;
  onTranscribe: (messageId: string) => void;
  onResend: (messageId: string) => void;
  onMessageAction: (
    action: MessageSheetAction,
    messageId: string,
    opts?: { focusComposer?: () => void },
  ) => void;
  onBranchFromMessage: (messageId: string) => void;
  onTruncateFromMessage: (index: number, draft: string) => void;
  archivedBranch: ArchivedBranch | null;
  branchPoint: number | null;
  activeTimeline: ActiveTimeline;
  forkSource: ForkSource | null;
  childForks: ForkLink[];
  onToggleArchivedBranch: () => void;
  onExpandInactiveBranch: () => void;
  onSwitchBranchTimeline: (timeline: ActiveTimeline) => void;
  onDeleteBranchTimeline: (timeline: ActiveTimeline) => void;
  onDeleteForkBranch: (childSessionId: string, childTitle?: string) => void;
  onOpenForkSource: () => void;
  onOpenSession: (sessionId: string) => void;
  messageReference: ThreadReference | null;
  onSetMessageReference: (ref: ThreadReference | null) => void;
  onReferenceFeedback: (feedback: MessageActionFeedback) => void;
  /** Posição de scroll guardada (lista invertida). */
  initialScrollY?: number;
  onScrollOffsetChange?: (y: number) => void;
  onScrollRestoreApplied?: () => void;
  onOpenPlans?: () => void;
  onOpenLimits?: () => void;
  /** Humor dual-layer do último turno (header). */
  lunaHumorAtual?: LunaHumorBadgeType | null;
}

interface Row {
  message: ChatMessage;
  firstInGroup: boolean;
  animateEnter: boolean;
}

type ThreadListItem =
  | { kind: 'message'; key: string; row: Row }
  | { kind: 'archived-branch'; key: 'archived-branch' }
  | { kind: 'branch-marker'; key: 'branch-marker' };

function buildThreadListItems(
  liveMessages: ChatMessage[],
  visibleMessages: ChatMessage[],
  branchPoint: number | null,
  hasArchivedBranch: boolean,
  inactiveMessageIds: ReadonlySet<string>,
  enterIds: ReadonlySet<string>,
): ThreadListItem[] {
  const rowFor = (message: ChatMessage, list: ChatMessage[], i: number): Row => ({
    message,
    firstInGroup: threadRowFirstInGroup(liveMessages, list, i),
    animateEnter: enterIds.has(message.id),
  });

  const hasSplit = branchPoint != null && branchPoint <= liveMessages.length && hasArchivedBranch;
  if (!hasSplit) {
    return visibleMessages
      .map((m, i) => ({
        kind: 'message' as const,
        key: m.id,
        row: rowFor(m, visibleMessages, i),
      }))
      .reverse();
  }

  const prefixIds = new Set(liveMessages.slice(0, branchPoint).map((m) => m.id));
  const continuationIds = new Set(liveMessages.slice(branchPoint).map((m) => m.id));
  const prefixVisible = visibleMessages.filter((m) => prefixIds.has(m.id));
  const continuationVisible = visibleMessages.filter(
    (m) => continuationIds.has(m.id) && !inactiveMessageIds.has(m.id),
  );

  const items: ThreadListItem[] = [];

  for (let i = continuationVisible.length - 1; i >= 0; i -= 1) {
    const m = continuationVisible[i];
    items.push({ kind: 'message', key: m.id, row: rowFor(m, continuationVisible, i) });
  }

  if (continuationVisible.length > 0) {
    items.push({ kind: 'branch-marker', key: 'branch-marker' });
  }

  items.push({ kind: 'archived-branch', key: 'archived-branch' });

  for (let i = prefixVisible.length - 1; i >= 0; i -= 1) {
    const m = prefixVisible[i];
    items.push({ kind: 'message', key: m.id, row: rowFor(m, prefixVisible, i) });
  }

  return items;
}

interface RowProps {
  item: Row;
  actionTargetId: string | null;
  quotePickTargetId: string | null;
  referenceHighlight: ReferenceHighlight | null;
  onTranscribe: (messageId: string) => void;
  onResend: (messageId: string) => void;
  onLongPress: (message: ChatMessage) => void;
  onThreadReferencePress: (reference: ThreadReference) => void;
  onOpenDocumentPreview: (
    attachment: import('../lib/composerAttachmentModel').ComposerAttachment,
    opts?: { highlightExcerpt?: string },
  ) => void;
  onOpenLunaProfile: () => void;
}

const ThreadMessageRow = memo(function ThreadMessageRow({
  item,
  actionTargetId,
  quotePickTargetId,
  referenceHighlight,
  onTranscribe,
  onResend,
  onLongPress,
  onThreadReferencePress,
  onOpenDocumentPreview,
  onOpenLunaProfile,
}: RowProps) {
  const handleLongPress = useCallback(() => {
    hapticLongPress();
    onLongPress(item.message);
  }, [item.message, onLongPress]);

  const isActionTarget = actionTargetId === item.message.id;
  const isReferenceHighlight = referenceHighlight?.messageId === item.message.id;
  const isQuotePickTarget = quotePickTargetId === item.message.id;
  const isHighlighted = isActionTarget || isReferenceHighlight;
  const highlightExcerpt = isReferenceHighlight ? referenceHighlight?.excerpt : undefined;
  const dimOthers =
    (actionTargetId != null && !isActionTarget) ||
    (referenceHighlight != null && !isReferenceHighlight) ||
    (quotePickTargetId != null && !isQuotePickTarget);

  return (
    <MessageBubble
      message={item.message}
      firstInGroup={item.firstInGroup}
      animateEnter={item.animateEnter}
      selected={isHighlighted}
      dimmed={dimOthers}
      highlightExcerpt={highlightExcerpt}
      onLongPress={handleLongPress}
      onTranscribe={onTranscribe}
      onResend={onResend}
      onThreadReferencePress={onThreadReferencePress}
      onOpenDocumentPreview={onOpenDocumentPreview}
      onOpenLunaProfile={onOpenLunaProfile}
    />
  );
});

const BUBBLE_ENTER_MS = 420;

/** Esconde resposta da Luna que chegou cedo via Firestore enquanto o indicador “pensando” está ativo. */
function threadMessagesWhileLoading(messages: ChatMessage[], loading: boolean): ChatMessage[] {
  const withoutEmptyStream = messages.filter((m) => {
    const semTextoAinda = m.role === 'luna' && m.streaming && !m.text?.trim();
    if (!semTextoAinda) return true;
    // Mesmo sem texto final, a bolha já pode ter pesquisa/raciocínio ao vivo — mostra.
    return Boolean(m.researchLive || m.research?.length || m.reasoning?.trim());
  });
  if (!loading || withoutEmptyStream.length === 0) return withoutEmptyStream;
  const last = withoutEmptyStream[withoutEmptyStream.length - 1];
  if (last.role === 'luna' && !last.streaming) return withoutEmptyStream.slice(0, -1);
  return withoutEmptyStream;
}

function useAnimatedMessageIds(
  sessionKey: string | null,
  messages: ChatMessage[],
  loading: boolean,
) {
  const seenIds = useRef(new Set<string>());
  const hydratedRef = useRef(false);
  const loadingWasRef = useRef(false);
  const skipEnterIdsRef = useRef(new Set<string>());
  const [enterIds, setEnterIds] = useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    seenIds.current = new Set();
    hydratedRef.current = false;
    loadingWasRef.current = false;
    skipEnterIdsRef.current = new Set();
    setEnterIds(new Set());
  }, [sessionKey]);

  React.useEffect(() => {
    if (loadingWasRef.current && !loading) {
      const last = messages[messages.length - 1];
      if (last?.role === 'luna') {
        skipEnterIdsRef.current.add(last.id);
      }
    }
    loadingWasRef.current = loading;
  }, [loading, messages]);

  React.useEffect(() => {
    const added = messages.filter((m) => !seenIds.current.has(m.id));
    if (added.length === 0) return;

    added.forEach((m) => seenIds.current.add(m.id));

    const isInitialHydration = !hydratedRef.current;
    hydratedRef.current = true;

    const isHistoryBatch =
      isInitialHydration && (added.length > 1 || messages.length > added.length);

    if (!isHistoryBatch) {
      const addedIds = added.map((m) => m.id);
      setEnterIds((prev) => {
        const next = new Set(prev);
        added.forEach((m) => {
          if (!skipEnterIdsRef.current.has(m.id)) {
            next.add(m.id);
          }
        });
        return next;
      });
      const timer = setTimeout(() => {
        setEnterIds((prev) => {
          const next = new Set(prev);
          addedIds.forEach((id) => next.delete(id));
          return next;
        });
      }, BUBBLE_ENTER_MS);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  return enterIds;
}

export const ThreadScreen = memo(function ThreadScreen({
  title,
  sessionKey,
  threadVisible,
  hydrating,
  messages,
  loading,
  draft,
  messageFeedback,
  onChange,
  onSend,
  onRosaryToggle,
  onRosaryLongPress,
  onRosaryReflection,
  onRosaryToggleMode,
  onRosaryStop,
  rosaryState,
  rosaryPlaceholder,
  rosaryBeadCurrent = 0,
  rosaryBeadTotal = 59,
  rosaryMode,
  onBack,
  quickMenuOpen,
  onQuickMenuToggle,
  onNewChat,
  onVoiceSend,
  onTranscribe,
  onResend,
  onMessageAction,
  onBranchFromMessage,
  onTruncateFromMessage,
  archivedBranch,
  branchPoint,
  activeTimeline,
  forkSource,
  childForks,
  onToggleArchivedBranch,
  onExpandInactiveBranch,
  onSwitchBranchTimeline,
  onDeleteBranchTimeline,
  onDeleteForkBranch,
  onOpenForkSource,
  onOpenSession,
  messageReference,
  onSetMessageReference,
  onReferenceFeedback,
  initialScrollY,
  onScrollOffsetChange,
  onScrollRestoreApplied,
  onOpenPlans,
  onOpenLimits,
  lunaHumorAtual,
}: Props) {
  const listRef = useRef<FlatList<ThreadListItem>>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const lunaUsage = useLunaUsageContext();
  const keyboardOpen = useKeyboardOpen();
  const rawKeyboard = useKeyboardHeight();
  const keyboardVisible = threadVisible && rawKeyboard > 0;
  const keyboardWasOpenRef = useRef(false);
  const { reduceMotion } = useMotionProfile();
  const headerTopPad = useHeaderTopPadding(6);

  const [sheetMessage, setSheetMessage] = useState<ChatMessage | null>(null);
  const [redoChoice, setRedoChoice] = useState<RedoUserChoice | null>(null);
  const [quotePickerMessage, setQuotePickerMessage] = useState<ChatMessage | null>(null);
  const [branchNavVisible, setBranchNavVisible] = useState(false);
  const [referenceHighlight, setReferenceHighlight] = useState<ReferenceHighlight | null>(null);
  const [ensureVisibleMessageId, setEnsureVisibleMessageId] = useState<string | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [docPreviewTarget, setDocPreviewTarget] = useState<AttachmentPreviewTarget | null>(null);
  const [docPreviewSourceMessage, setDocPreviewSourceMessage] = useState<ChatMessage | null>(null);
  const [lunaProfileOpen, setLunaProfileOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const referenceHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReferenceScrollId = useRef<string | null>(null);

  useAndroidBackHandler(
    useCallback(() => {
      if (branchNavVisible) {
        setBranchNavVisible(false);
        return true;
      }
      if (redoChoice) {
        setRedoChoice(null);
        return true;
      }
      if (sheetMessage) {
        setSheetMessage(null);
        return true;
      }
      if (docPreviewTarget) {
        setDocPreviewTarget(null);
        setDocPreviewSourceMessage(null);
        return true;
      }
      if (quotePickerMessage) {
        setQuotePickerMessage(null);
        return true;
      }
      if (lunaProfileOpen) {
        setLunaProfileOpen(false);
        return true;
      }
      return false;
    }, [branchNavVisible, redoChoice, sheetMessage, docPreviewTarget, quotePickerMessage, lunaProfileOpen]),
    threadVisible,
  );

  const liveMessages = useFrozenWhenHidden(threadVisible, messages);
  const liveTitle = useFrozenWhenHidden(threadVisible, title);
  const liveLoading = useFrozenWhenHidden(threadVisible, loading);
  const liveDraft = useFrozenWhenHidden(threadVisible, draft);
  const liveHydrating = useFrozenWhenHidden(threadVisible, hydrating);

  const displayMessages = useMemo(
    () => threadMessagesWhileLoading(liveMessages, liveLoading),
    [liveLoading, liveMessages],
  );

  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const openLunaProfile = useCallback(() => {
    hapticListTap();
    setLunaProfileOpen(true);
  }, []);

  const handleExportConversation = useCallback(() => {
    const text = formatConversationForExport(title, messages);
    // Share nativo do RN — sem dependência nova. No Android compartilha o texto;
    // no iOS `message` + `title` (assunto no e-mail).
    void Share.share({ message: text, title: title || 'Conversa' }).catch(() => {});
  }, [messages, title]);

  const headerMenuItems = useMemo<ThreadMenuItem[]>(() => {
    const items: ThreadMenuItem[] = [];
    if (onNewChat) {
      items.push({
        key: 'new_chat',
        label: 'Nova conversa',
        icon: 'chatbubble-ellipses-outline',
        onPress: onNewChat,
      });
    }
    items.push({
      key: 'export',
      label: 'Exportar conversa',
      icon: 'share-outline',
      onPress: handleExportConversation,
      disabled: messages.length === 0,
    });
    return items;
  }, [handleExportConversation, messages.length, onNewChat]);

  const {
    visibleMessages,
    hasOlderHidden,
    expandWindow,
    onListScroll,
    windowingActive,
  } = useProgressiveThreadWindow(
    sessionKey,
    displayMessages,
    threadVisible,
    ensureVisibleMessageId,
  );

  const enterIds = useAnimatedMessageIds(sessionKey, displayMessages, liveLoading);

  const inactiveMessageIds = useMemo(
    () => new Set(archivedBranch?.messages.map((m) => m.id) ?? []),
    [archivedBranch],
  );

  const listItems = useMemo(
    () =>
      buildThreadListItems(
        liveMessages,
        visibleMessages,
        branchPoint,
        archivedBranch != null,
        inactiveMessageIds,
        enterIds,
      ),
    [archivedBranch, branchPoint, enterIds, inactiveMessageIds, liveMessages, visibleMessages],
  );

  const inactiveBranchLabel = useMemo(() => {
    if (!archivedBranch) return undefined;
    const count = archivedBranch.messages.length;
    const base = inactiveTimelineLabel(activeTimeline);
    return `${base} · ${count} ${count === 1 ? 'mensagem' : 'mensagens'}`;
  }, [activeTimeline, archivedBranch]);

  const [rosaryHudHeight, setRosaryHudHeight] = useState(0);

  useEffect(() => {
    if (!rosaryState?.active) setRosaryHudHeight(0);
  }, [rosaryState?.active]);

  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      rosaryState?.active && rosaryHudHeight > 0
        ? { paddingBottom: rosaryHudHeight + 8 }
        : null,
    ],
    [rosaryState?.active, rosaryHudHeight],
  );

  const activeTailMessages = useMemo(() => {
    if (branchPoint == null) return displayMessages;
    return displayMessages.slice(branchPoint);
  }, [branchPoint, displayMessages]);

  const hasBranchNav =
    (branchPoint != null && archivedBranch != null) || forkSource != null || childForks.length > 0;

  const lastMessageIsStreamingLuna =
    liveMessages.length > 0 &&
    liveMessages[liveMessages.length - 1]?.role === 'luna' &&
    liveMessages[liveMessages.length - 1]?.streaming === true &&
    Boolean(liveMessages[liveMessages.length - 1]?.text?.trim());
  const showThinking = liveLoading && !lastMessageIsStreamingLuna;

  const scrollToListItem = useCallback(
    (kind: 'branch-marker' | 'archived-branch') => {
      const index = listItems.findIndex((item) => item.kind === kind);
      if (index === -1) return;
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index,
          animated: !reduceMotion,
          viewPosition: 0.45,
        });
      });
    },
    [listItems, reduceMotion],
  );

  const clearReferenceHighlight = useCallback(() => {
    if (referenceHighlightTimer.current) {
      clearTimeout(referenceHighlightTimer.current);
      referenceHighlightTimer.current = null;
    }
    pendingReferenceScrollId.current = null;
    setReferenceHighlight(null);
    setEnsureVisibleMessageId(null);
  }, []);

  const handleReferencePress = useCallback(
    (reference: ThreadReference) => {
      hapticListTap();
      clearReferenceHighlight();

      if (isDocumentReference(reference)) {
        const attachment = findAttachmentForReference(liveMessages, reference);
        if (!attachment?.uri) return;
        setDocPreviewSourceMessage(liveMessages.find((m) => m.id === reference.messageId) ?? null);
        setDocPreviewTarget({
          attachment,
          highlightExcerpt: reference.excerpt.trim(),
        });
        return;
      }

      if (!liveMessages.some((m) => m.id === reference.messageId)) return;

      pendingReferenceScrollId.current = reference.messageId;
      setEnsureVisibleMessageId(reference.messageId);
      setReferenceHighlight({ messageId: reference.messageId, excerpt: reference.excerpt.trim() });

      referenceHighlightTimer.current = setTimeout(() => {
        clearReferenceHighlight();
      }, REFERENCE_HIGHLIGHT_MS);
    },
    [clearReferenceHighlight, liveMessages],
  );

  const handleOpenDocumentPreview = useCallback(
    (
      attachment: import('../lib/composerAttachmentModel').ComposerAttachment,
      opts?: { highlightExcerpt?: string },
    ) => {
      hapticListTap();
      const sourceMessage =
        liveMessages.find((m) => m.attachments?.some((a) => a.id === attachment.id)) ?? null;
      setDocPreviewSourceMessage(sourceMessage);
      setDocPreviewTarget({
        attachment,
        highlightExcerpt: opts?.highlightExcerpt,
      });
    },
    [liveMessages],
  );

  const handleDocumentReferenceConfirm = useCallback(
    (excerpt: string, fullDocumentText: string) => {
      if (!docPreviewTarget || !docPreviewSourceMessage) return;
      const ref = buildDocumentReference(
        docPreviewSourceMessage,
        liveMessages,
        docPreviewTarget.attachment,
        fullDocumentText,
        excerpt,
      );
      if (!ref) return;
      onSetMessageReference(ref);
      onReferenceFeedback(feedbackForReference(ref));
      setDocPreviewTarget(null);
      focusComposer();
    },
    [
      docPreviewSourceMessage,
      docPreviewTarget,
      focusComposer,
      liveMessages,
      onReferenceFeedback,
      onSetMessageReference,
    ],
  );

  React.useEffect(() => {
    return () => {
      if (referenceHighlightTimer.current) {
        clearTimeout(referenceHighlightTimer.current);
      }
    };
  }, []);

  React.useEffect(() => {
    clearReferenceHighlight();
    setDocPreviewTarget(null);
    setDocPreviewSourceMessage(null);
  }, [sessionKey, clearReferenceHighlight]);

  React.useEffect(() => {
    const targetId = pendingReferenceScrollId.current ?? ensureVisibleMessageId;
    if (!targetId) return;

    const index = listItems.findIndex(
      (item) => item.kind === 'message' && item.row.message.id === targetId,
    );
    if (index === -1) return;

    pendingReferenceScrollId.current = null;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: !reduceMotion,
        viewPosition: 0.45,
      });
    }, 48);
    return () => clearTimeout(t);
  }, [ensureVisibleMessageId, listItems, reduceMotion]);

  const handleBranchNavAction = useCallback(
    (action: BranchNavigatorAction) => {
      switch (action.type) {
        case 'switch-timeline':
          onSwitchBranchTimeline(action.timeline);
          setBranchNavVisible(false);
          break;
        case 'scroll-to':
          setBranchNavVisible(false);
          scrollToListItem(action.target === 'inactive-block' ? 'archived-branch' : 'branch-marker');
          break;
        case 'expand-inactive':
          onExpandInactiveBranch();
          setBranchNavVisible(false);
          scrollToListItem('archived-branch');
          break;
        case 'open-session':
          setBranchNavVisible(false);
          onOpenSession(action.sessionId);
          break;
        case 'delete-timeline':
          onDeleteBranchTimeline(action.timeline);
          setBranchNavVisible(false);
          break;
        case 'delete-fork':
          void onDeleteForkBranch(action.childSessionId, action.childTitle);
          setBranchNavVisible(false);
          break;
        default:
          break;
      }
    },
    [onDeleteBranchTimeline, onDeleteForkBranch, onExpandInactiveBranch, onOpenSession, onSwitchBranchTimeline, scrollToListItem],
  );

  const hasMessages = liveMessages.length > 0 || archivedBranch != null;
  const isLargeThread = visibleMessages.length >= 16;
  const quotePickActive = quotePickerMessage != null;
  const docPreviewActive = docPreviewTarget != null;

  const handleLongPress = useCallback((message: ChatMessage) => {
    setSheetMessage(message);
  }, []);

  const handleSheetAction = useCallback(
    (action: MessageSheetAction, message: ChatMessage) => {
      if (action === 'reference') {
        setSheetMessage(null);
        setQuotePickerMessage(message);
        return;
      }
      if (action === 'redo') {
        const choice = redoUserNeedsChoice(liveMessages, message);
        if (choice) {
          setRedoChoice(choice);
          return;
        }
      }
      onMessageAction(action, message.id, { focusComposer });
    },
    [focusComposer, liveMessages, onMessageAction],
  );

  const handleQuoteConfirm = useCallback(
    (excerpt: string) => {
      if (!quotePickerMessage) return;
      const ref = buildMessageReference(quotePickerMessage, liveMessages, excerpt);
      if (!ref) return;
      onSetMessageReference(ref);
      onReferenceFeedback(feedbackForReference(ref));
      setQuotePickerMessage(null);
      focusComposer();
    },
    [focusComposer, liveMessages, onReferenceFeedback, onSetMessageReference, quotePickerMessage],
  );

  const handleBranch = useCallback(() => {
    if (!redoChoice) return;
    onBranchFromMessage(redoChoice.message.id);
    setRedoChoice(null);
    focusComposer();
  }, [focusComposer, onBranchFromMessage, redoChoice]);

  const handleTruncate = useCallback(() => {
    if (!redoChoice) return;
    onTruncateFromMessage(
      redoChoice.index,
      redoChoice.message.text ?? redoChoice.message.transcript ?? '',
    );
    setRedoChoice(null);
    focusComposer();
  }, [focusComposer, onTruncateFromMessage, redoChoice]);

  const renderItem = useCallback(
    ({ item }: { item: ThreadListItem }) => {
      if (item.kind === 'archived-branch') {
        if (!archivedBranch) return null;
        return (
          <MessageArchivedBranch
            branch={archivedBranch}
            headingLabel={inactiveBranchLabel}
            onToggle={onToggleArchivedBranch}
          />
        );
      }
      if (item.kind === 'branch-marker') {
        return <BranchContinuationMarker />;
      }
      return (
        <ThreadMessageRow
          item={item.row}
          actionTargetId={sheetMessage?.id ?? null}
          quotePickTargetId={quotePickerMessage?.id ?? null}
          referenceHighlight={referenceHighlight}
          onTranscribe={onTranscribe}
          onResend={onResend}
          onLongPress={handleLongPress}
          onThreadReferencePress={handleReferencePress}
          onOpenDocumentPreview={handleOpenDocumentPreview}
          onOpenLunaProfile={openLunaProfile}
        />
      );
    },
    [
      archivedBranch,
      handleLongPress,
      handleOpenDocumentPreview,
      handleReferencePress,
      inactiveBranchLabel,
      onToggleArchivedBranch,
      onTranscribe,
      onResend,
      quotePickerMessage,
      referenceHighlight,
      sheetMessage?.id,
      openLunaProfile,
    ],
  );

  const keyExtractor = useCallback((item: ThreadListItem) => item.key, []);

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      onListScroll(contentOffset.y, contentSize.height, layoutMeasurement.height);
      onScrollOffsetChange?.(contentOffset.y);
      setScrolledUp(contentOffset.y > SCROLL_AWAY_THRESHOLD);
    },
    [onListScroll, onScrollOffsetChange],
  );

  const scrollToBottom = useCallback(() => {
    hapticListTap();
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    setScrolledUp(false);
  }, [reduceMotion]);

  const handleEndReached = useCallback(() => {
    if (hasOlderHidden) expandWindow();
  }, [expandWindow, hasOlderHidden]);

  React.useEffect(() => {
    const justOpened = keyboardVisible && !keyboardWasOpenRef.current;
    keyboardWasOpenRef.current = keyboardVisible;
    if (!justOpened) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    });
    setScrolledUp(false);
  }, [keyboardVisible, reduceMotion]);

  React.useEffect(() => {
    setScrolledUp(false);
  }, [sessionKey]);

  React.useEffect(() => {
    if (initialScrollY == null || initialScrollY <= 0 || !hasMessages) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: initialScrollY, animated: false });
      setScrolledUp(initialScrollY > SCROLL_AWAY_THRESHOLD);
      onScrollRestoreApplied?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [sessionKey, initialScrollY, hasMessages, onScrollRestoreApplied]);

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={tokens.textHigh} />
        </Pressable>
        <Pressable
          onPress={openLunaProfile}
          style={({ pressed }) => [styles.headerProfileTap, pressed && styles.headerProfilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Perfil da Luna"
        >
          <LunaAvatar size={36} />
          <View style={styles.headerText}>
            <Text style={type.headerTitle} numberOfLines={1}>
              {liveTitle}
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={type.headerStatus} numberOfLines={1}>
                {liveLoading ? 'pensando…' : 'online'}
              </Text>
            </View>
          </View>
        </Pressable>
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={() => {
            hapticListTap();
            setHeaderMenuOpen(true);
          }}
          hitSlop={12}
          style={[styles.iconBtn, styles.headerAddBtn]}
          accessibilityLabel="Opções da conversa"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={tokens.textMid} />
        </Pressable>
      </View>

      <ThreadHeaderMenu
        visible={headerMenuOpen}
        onClose={() => setHeaderMenuOpen(false)}
        items={headerMenuItems}
        topOffset={headerTopPad + 46}
      />

      {forkSource ? (
        <ForkSourceBanner parentTitle={forkSource.title} onOpenParent={onOpenForkSource} />
      ) : null}

      {hasBranchNav ? (
        <ThreadBranchPill
          activeTimeline={activeTimeline}
          inactiveCount={archivedBranch?.messages.length ?? 0}
          forkCount={childForks.length + (forkSource ? 1 : 0)}
          onPress={() => setBranchNavVisible(true)}
        />
      ) : null}

      {!hasMessages && liveHydrating ? (
        <SkeletonMessageList />
      ) : !hasMessages && !liveLoading ? (
        <View style={styles.empty}>
          <LunaAvatar size={80} zoom={1.18} />
          <Text style={styles.emptyTitle}>Pergunte o que quiser</Text>
          <Text style={styles.emptySub}>A Luna responde passo a passo, no seu ritmo.</Text>
        </View>
      ) : (
        <View style={styles.listStage}>
          {rosaryState?.active ? (
            <RosarySessionHud
              state={rosaryState}
              beadCurrent={rosaryBeadCurrent}
              beadTotal={rosaryBeadTotal}
              prayerMode={rosaryMode ?? null}
              onToggleMode={onRosaryToggleMode ?? (() => {})}
              onStop={onRosaryStop ?? (() => {})}
              onReflection={onRosaryReflection}
              onHeightChange={setRosaryHudHeight}
            />
          ) : null}
          <FlatList
            ref={listRef}
            data={listItems}
            inverted
            key={sessionKey ?? 'local'}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={
              showThinking ? (
                <LunaThinking humor={lunaHumorAtual} onOpenProfile={openLunaProfile} />
              ) : null
            }
            contentContainerStyle={listContentStyle}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={32}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            maintainVisibleContentPosition={
              windowingActive
                ? { minIndexForVisible: 1, autoscrollToTopThreshold: 24 }
                : undefined
            }
            removeClippedSubviews={Platform.OS === 'android' && !quotePickActive && !docPreviewActive}
            nestedScrollEnabled
            initialNumToRender={isLargeThread ? 6 : 8}
            maxToRenderPerBatch={isLargeThread ? 5 : 6}
            windowSize={isLargeThread ? 7 : 9}
            updateCellsBatchingPeriod={isLargeThread ? 64 : 48}
            onScrollToIndexFailed={(info) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: !reduceMotion,
                });
              });
            }}
          />
          <ThreadScrollToBottomFab
            visible={scrolledUp && !quotePickActive && !docPreviewActive}
            loading={liveLoading}
            onPress={scrollToBottom}
          />
        </View>
      )}

      <MessageActionToast feedback={threadVisible && keyboardOpen ? null : messageFeedback} />

      {quotePickerMessage ? (
        <QuotePickOverlay
          visible={quotePickerMessage != null}
          message={quotePickerMessage}
          messageIndex={liveMessages.findIndex((m) => m.id === quotePickerMessage.id) + 1}
          onConfirm={handleQuoteConfirm}
          onCancel={() => setQuotePickerMessage(null)}
        />
      ) : null}

      <View style={styles.composerZone}>
        <ComposerDock>
          {lunaUsage.isExceeded ? (
            <UsageLimitChip
              usage={lunaUsage.usage}
              remaining={lunaUsage.remaining}
              exceeded
              onPress={onOpenLimits ?? onOpenPlans}
            />
          ) : lunaUsage.isReducedMode ? (
            <UsageLimitChip
              usage={lunaUsage.usage}
              remaining={lunaUsage.remaining}
              reduced
              onPress={onOpenLimits ?? onOpenPlans}
            />
          ) : null}
          <Composer
            ref={composerRef}
            value={liveDraft}
            onChange={onChange}
            onSend={onSend}
            onVoiceResult={onVoiceSend}
            rosaryState={rosaryState}
            onRosaryToggle={onRosaryToggle}
            onRosaryLongPress={onRosaryLongPress}
            placeholder={
              quotePickActive
                ? 'Selecione o trecho na bolha…'
                : liveLoading
                  ? 'Luna pensando…'
                  : rosaryState?.active && rosaryPlaceholder
                    ? rosaryPlaceholder
                    : quotaComposerPlaceholder(
                        lunaUsage.usage,
                        lunaUsage.isExceeded,
                        'Converse com a Luna…',
                        lunaUsage.isReducedMode,
                      )
            }
            editable={!liveLoading && !quotePickActive && !docPreviewActive && !lunaUsage.isExceeded}
            messageReference={messageReference}
            onClearReference={() => onSetMessageReference(null)}
          />
        </ComposerDock>
      </View>

      <AttachmentPreviewModal
        visible={docPreviewTarget != null}
        target={docPreviewTarget}
        onClose={() => {
          setDocPreviewTarget(null);
          setDocPreviewSourceMessage(null);
        }}
        onConfirmReference={docPreviewSourceMessage ? handleDocumentReferenceConfirm : undefined}
      />

      <MessageActionSheet
        visible={sheetMessage != null}
        message={sheetMessage}
        messages={liveMessages}
        onClose={() => setSheetMessage(null)}
        onAction={handleSheetAction}
      />

      <MessageRedoChoiceSheet
        visible={redoChoice != null}
        choice={redoChoice}
        onBranch={handleBranch}
        onTruncate={handleTruncate}
        onCancel={() => setRedoChoice(null)}
      />

      <BranchNavigatorSheet
        visible={branchNavVisible}
        branchPoint={branchPoint}
        activeTimeline={activeTimeline}
        activeTailCount={activeTailMessages.length}
        activeTailMessages={activeTailMessages}
        archivedBranch={archivedBranch}
        forkSource={forkSource}
        childForks={childForks}
        onAction={handleBranchNavAction}
        onClose={() => setBranchNavVisible(false)}
      />

      <LunaProfileSheet
        visible={lunaProfileOpen}
        onClose={() => setLunaProfileOpen(false)}
        humor={lunaHumorAtual}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: tokens.glassBorder,
  },
  iconBtn: { padding: 8 },
  headerProfileTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginLeft: 2,
    paddingVertical: 4,
    paddingRight: 8,
    borderRadius: 12,
  },
  headerProfilePressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerText: { flex: 1, marginLeft: 10, minWidth: 0 },
  headerSpacer: { width: 4 },
  headerAddBtn: {
    flexShrink: 0,
    marginLeft: 2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.online,
    shadowColor: tokens.online,
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  list: { flex: 1 },
  listStage: { flex: 1, position: 'relative' },
  listContent: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: {
    color: tokens.textHigh,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    letterSpacing: -0.3,
  },
  emptySub: {
    color: tokens.textMid,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 260,
  },
  composerZone: {
    position: 'relative',
  },
});
