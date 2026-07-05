import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { demoThread, sessions, type SessionItem } from '../data/fixtures';
import {
  clearWarmCache,
  prefetchRecentSessions,
  seedWarmSnapshot,
  warmSession,
} from '../lib/conversationWarmCache';

interface Options {
  uid: string | null;
  cloudEnabled: boolean;
  recents: SessionItem[];
  activeSessionId: string | null;
}

/** Prefetch em idle — não cancela ao alternar home ↔ thread. */
export function useConversationPrefetch({
  uid,
  cloudEnabled,
  recents,
  activeSessionId,
}: Options) {
  const recentsKey = useRef('');

  useEffect(() => {
    if (!cloudEnabled || !uid) {
      if (!cloudEnabled) {
        for (const s of sessions.slice(0, 6)) {
          seedWarmSnapshot(s.id, demoThread, s.title);
        }
      }
      return;
    }

    const key = recents.map((s) => s.id).join('|');
    if (key === recentsKey.current) return;
    recentsKey.current = key;

    const skip = new Set<string>();
    if (activeSessionId) skip.add(activeSessionId);

    const task = InteractionManager.runAfterInteractions(() => {
      prefetchRecentSessions(uid, recents.map((s) => s.id), { skip, limit: 8 });
    });

    return () => task.cancel();
  }, [activeSessionId, cloudEnabled, recents, uid]);

  useEffect(() => {
    return () => {
      if (cloudEnabled) clearWarmCache();
    };
  }, [cloudEnabled, uid]);
}

export function prefetchSessionOnTouch(uid: string | null, cloudEnabled: boolean, sessionId: string) {
  if (cloudEnabled && uid) {
    warmSession(uid, sessionId);
    return;
  }
  const found = sessions.find((s) => s.id === sessionId);
  if (found) {
    seedWarmSnapshot(sessionId, demoThread, found.title);
  }
}
