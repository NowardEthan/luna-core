import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatMessage } from '../data/fixtures';
import type { ActiveTimeline, ArchivedBranch } from './branchState';

const BRANCH_PREFIX = 'orbit.branch.v1';
const FORK_PREFIX = 'orbit.forklinks.v1';

export interface PersistedBranchState {
  branchPoint: number;
  activeTimeline: ActiveTimeline;
  continuationTail: ChatMessage[];
  archivedTail: ChatMessage[];
  archivedMeta: Pick<ArchivedBranch, 'id' | 'fromMessageId' | 'label'>;
}

export interface ForkLink {
  parentSessionId: string;
  childSessionId: string;
  childTitle: string;
  createdAt: string;
}

function branchKey(sessionId: string): string {
  return `${BRANCH_PREFIX}.${sessionId}`;
}

export async function loadBranchState(sessionId: string): Promise<PersistedBranchState | null> {
  try {
    const raw = await AsyncStorage.getItem(branchKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedBranchState;
  } catch {
    return null;
  }
}

export async function saveBranchState(sessionId: string, state: PersistedBranchState | null): Promise<void> {
  try {
    const key = branchKey(sessionId);
    if (!state) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.warn('[branchStorage] saveBranchState failed', err);
  }
}

export async function appendForkLink(link: ForkLink): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FORK_PREFIX);
    const list: ForkLink[] = raw ? (JSON.parse(raw) as ForkLink[]) : [];
    if (list.some((l) => l.childSessionId === link.childSessionId)) return;
    list.unshift(link);
    await AsyncStorage.setItem(FORK_PREFIX, JSON.stringify(list.slice(0, 80)));
  } catch (err) {
    console.warn('[branchStorage] appendForkLink failed', err);
  }
}

export async function removeForkLink(childSessionId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FORK_PREFIX);
    if (!raw) return;
    const list = JSON.parse(raw) as ForkLink[];
    const next = list.filter((l) => l.childSessionId !== childSessionId);
    await AsyncStorage.setItem(FORK_PREFIX, JSON.stringify(next));
  } catch (err) {
    console.warn('[branchStorage] removeForkLink failed', err);
  }
}

export async function loadForkLinks(): Promise<ForkLink[]> {
  try {
    const raw = await AsyncStorage.getItem(FORK_PREFIX);
    if (!raw) return [];
    return JSON.parse(raw) as ForkLink[];
  } catch {
    return [];
  }
}

export function getChildForksFromList(all: ForkLink[], parentSessionId: string): ForkLink[] {
  return all.filter((l) => l.parentSessionId === parentSessionId);
}

export function splitAtBranchPoint(
  messages: ChatMessage[],
  branchPoint: number,
): { prefix: ChatMessage[]; activeTail: ChatMessage[] } {
  return {
    prefix: messages.slice(0, branchPoint),
    activeTail: messages.slice(branchPoint),
  };
}

export function buildPersistedBranchState(
  branchPoint: number,
  activeTimeline: ActiveTimeline,
  archivedBranch: ArchivedBranch,
  messages: ChatMessage[],
): PersistedBranchState {
  const { activeTail } = splitAtBranchPoint(messages, branchPoint);
  const inactiveTail = archivedBranch.messages;

  return {
    branchPoint,
    activeTimeline,
    continuationTail: activeTimeline === 'continuation' ? activeTail : inactiveTail,
    archivedTail: activeTimeline === 'archived' ? activeTail : inactiveTail,
    archivedMeta: {
      id: archivedBranch.id,
      fromMessageId: archivedBranch.fromMessageId,
      label: archivedBranch.label,
    },
  };
}

export function rebuildArchivedBranch(
  persisted: PersistedBranchState,
  activeTimeline: ActiveTimeline,
): ArchivedBranch {
  const inactiveTail =
    activeTimeline === 'continuation' ? persisted.archivedTail : persisted.continuationTail;

  return {
    id: persisted.archivedMeta.id,
    fromMessageId: persisted.archivedMeta.fromMessageId,
    label: persisted.archivedMeta.label,
    messages: inactiveTail,
    expanded: false,
  };
}

export function rebuildActiveMessages(
  prefix: ChatMessage[],
  persisted: PersistedBranchState,
): ChatMessage[] {
  const tail =
    persisted.activeTimeline === 'continuation'
      ? persisted.continuationTail
      : persisted.archivedTail;
  return [...prefix, ...tail];
}
