import type { ChatMessage } from '../data/fixtures';
import { messageCopyText } from './messageActions';

export type ArchivedBranch = {
  id: string;
  fromMessageId: string;
  label: string;
  messages: ChatMessage[];
  expanded: boolean;
};

export type ForkSource = {
  sessionId: string;
  title: string;
};

export type ActiveTimeline = 'continuation' | 'archived';

export type BranchScrollTarget = 'split' | 'inactive-block';

export function timelineLabel(active: ActiveTimeline): string {
  return active === 'continuation' ? 'Ramo alternativo' : 'Ramo anterior';
}

export function inactiveTimelineLabel(active: ActiveTimeline): string {
  return active === 'continuation' ? 'Ramo anterior' : 'Ramo alternativo';
}

export function branchPreviewText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const t = m.text?.trim() || m.transcript?.trim();
    if (t) return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }
  return 'Sem texto';
}

/** Troca qual ramo está activo — o inactivo vai para archivedBranch. */
export function swapBranchTimelines(
  messages: ChatMessage[],
  branchPoint: number,
  archivedBranch: ArchivedBranch,
  currentTimeline: ActiveTimeline,
): {
  messages: ChatMessage[];
  archivedBranch: ArchivedBranch;
  activeTimeline: ActiveTimeline;
} {
  const prefix = messages.slice(0, branchPoint);
  const activeTail = messages.slice(branchPoint);
  const inactiveTail = archivedBranch.messages;
  const nextTimeline = flipTimeline(currentTimeline);

  return {
    messages: [...prefix, ...inactiveTail],
    archivedBranch: {
      ...archivedBranch,
      messages: activeTail,
      expanded: false,
    },
    activeTimeline: nextTimeline,
  };
}

export function flipTimeline(current: ActiveTimeline): ActiveTimeline {
  return current === 'continuation' ? 'archived' : 'continuation';
}

/** Ramificar — arquiva o ramo a partir da mensagem escolhida (concept Orbit). */
export function applyRedoBranch(
  messages: ChatMessage[],
  index: number,
): {
  prefix: ChatMessage[];
  archived: ArchivedBranch;
  composerDraft: string;
  branchPoint: number;
} {
  const composerDraft = messageCopyText(messages[index] ?? { id: '', role: 'user' });
  const archivedMessages = messages.slice(index);
  const prefix = messages.slice(0, index);
  return {
    prefix,
    composerDraft,
    branchPoint: prefix.length,
    archived: {
      id: `branch-${messages[index]?.id ?? index}-${Date.now()}`,
      fromMessageId: messages[index]?.id ?? '',
      label: `Ramo anterior · ${archivedMessages.length} ${archivedMessages.length === 1 ? 'mensagem' : 'mensagens'}`,
      messages: archivedMessages,
      expanded: false,
    },
  };
}

export function forkTitleFromParent(parentTitle: string): string {
  if (!parentTitle || parentTitle === 'Luna') return 'Bifurcação';
  const base = parentTitle.length > 36 ? `${parentTitle.slice(0, 33)}…` : parentTitle;
  return `${base} · bifurcação`;
}
