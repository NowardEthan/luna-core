import React, { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OrbitTabBar, OrbitTabId } from '../components/OrbitTabBar';
import { TabPane } from '../components/TabPane';
import { SessionItem, UserProfile, VoiceClip } from '../data/fixtures';
import { useKeyboardOpen } from '../hooks/useKeyboardBottomInset';
import type { TrashSessionItem } from '../lib/firebase/firestoreTrash';
import { tabSlideDirection } from '../lib/motionTokens';
import { ConversationsScreen } from './ConversationsScreen';
import { HomeScreen } from './HomeScreen';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen } from './SettingsScreen';

interface Props {
  user: UserProfile;
  avatarUrl?: string | null;
  uid: string | null;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  authError: string | null;
  onResetSession: () => Promise<void>;
  sessions: SessionItem[];
  syncError?: string | null;
  mainTab: OrbitTabId;
  onMainTabChange: (tab: OrbitTabId) => void;
  draft: string;
  onDraftChange: (t: string) => void;
  onSendFromHome: () => void;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  trashSessions: TrashSessionItem[];
  onRestoreSession: (id: string) => void;
  onPermanentDeleteTrash: (id: string) => void;
  onNewChat: () => void;
  onVoiceSend: (clip: VoiceClip) => void;
  onOpenPlans?: () => void;
}

const INITIAL_MOUNT: Record<OrbitTabId, boolean> = {
  inicio: true,
  conversas: false,
  conta: false,
  definicoes: false,
};

/** Shell principal — abas montadas + transição suave entre painéis. */
export const MainShell = memo(function MainShell({
  user,
  avatarUrl,
  uid,
  email,
  photoURL,
  isAnonymous,
  authError,
  onResetSession,
  sessions,
  syncError,
  mainTab,
  onMainTabChange,
  draft,
  onDraftChange,
  onSendFromHome,
  onOpenSession,
  onPrefetchSession,
  onDeleteSession,
  trashSessions,
  onRestoreSession,
  onPermanentDeleteTrash,
  onNewChat,
  onVoiceSend,
  onOpenPlans,
}: Props) {
  const tab = mainTab;
  const [mounted, setMounted] = useState(INITIAL_MOUNT);
  const [enterDirection, setEnterDirection] = useState(0);
  const [stackOrder, setStackOrder] = useState(1);
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => {
    setMounted((prev) => (prev[mainTab] ? prev : { ...prev, [mainTab]: true }));
  }, [mainTab]);

  const selectTab = useCallback(
    (next: OrbitTabId) => {
      if (next === tab) return;
      setEnterDirection(tabSlideDirection(tab, next));
      setStackOrder((n) => n + 1);
      setMounted((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
      onMainTabChange(next);
    },
    [onMainTabChange, tab],
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {mounted.inicio ? (
          <TabPane visible={tab === 'inicio'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <HomeScreen
              user={user}
              avatarUrl={avatarUrl}
              recents={sessions}
              draft={draft}
              onChange={onDraftChange}
              onSend={onSendFromHome}
              onOpenRecent={onOpenSession}
              onPrefetchSession={onPrefetchSession}
              onDeleteSession={onDeleteSession}
              onVoiceSend={onVoiceSend}
              onOpenPlans={onOpenPlans}
              onOpenProfile={() => selectTab('conta')}
              onOpenConversas={() => selectTab('conversas')}
            />
          </TabPane>
        ) : null}

        {mounted.conversas ? (
          <TabPane visible={tab === 'conversas'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <ConversationsScreen
              sessions={sessions}
              trashSessions={trashSessions}
              syncError={syncError}
              onOpenSession={onOpenSession}
              onPrefetchSession={onPrefetchSession}
              onDeleteSession={onDeleteSession}
              onRestoreSession={onRestoreSession}
              onPermanentDeleteTrash={onPermanentDeleteTrash}
            />
          </TabPane>
        ) : null}

        {mounted.conta ? (
          <TabPane visible={tab === 'conta'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <ProfileScreen sessions={sessions} onOpenSession={onOpenSession} />
          </TabPane>
        ) : null}

        {mounted.definicoes ? (
          <TabPane visible={tab === 'definicoes'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <SettingsScreen isAnonymous={isAnonymous} onResetSession={onResetSession} />
          </TabPane>
        ) : null}
      </View>

      {!keyboardOpen ? (
        <OrbitTabBar active={tab} onTab={selectTab} onNewChat={onNewChat} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
