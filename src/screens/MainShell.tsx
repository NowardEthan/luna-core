import React, { memo, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OrbitTabBar, OrbitTabId } from '../components/OrbitTabBar';
import { TabPane } from '../components/TabPane';
import { SessionItem, UserProfile, VoiceClip } from '../data/fixtures';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import type { TrashSessionItem } from '../lib/firebase/firestoreTrash';
import { tabSlideDirection } from '../lib/motionTokens';
import { ConversationsScreen } from './ConversationsScreen';
import { HomeScreen } from './HomeScreen';
import { AccountScreen } from './AccountScreen';
import { PlaceholderScreen } from './PlaceholderScreen';

interface Props {
  user: UserProfile;
  uid: string | null;
  email: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  authError: string | null;
  onResetSession: () => Promise<void>;
  sessions: SessionItem[];
  syncError?: string | null;
  draft: string;
  onDraftChange: (t: string) => void;
  onSendFromHome: () => void;
  onSuggestion: (t: string) => void;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  trashSessions: TrashSessionItem[];
  onRestoreSession: (id: string) => void;
  onPermanentDeleteTrash: (id: string) => void;
  onNewChat: () => void;
  onVoiceSend: (clip: VoiceClip) => void;
}

const INITIAL_MOUNT: Record<OrbitTabId, boolean> = {
  inicio: true,
  conversas: false,
  lumen: false,
  conta: false,
};

/** Shell principal — abas montadas + transição suave entre painéis. */
export const MainShell = memo(function MainShell({
  user,
  uid,
  email,
  photoURL,
  isAnonymous,
  authError,
  onResetSession,
  sessions,
  syncError,
  draft,
  onDraftChange,
  onSendFromHome,
  onSuggestion,
  onOpenSession,
  onPrefetchSession,
  onDeleteSession,
  trashSessions,
  onRestoreSession,
  onPermanentDeleteTrash,
  onNewChat,
  onVoiceSend,
}: Props) {
  const [tab, setTab] = useState<OrbitTabId>('inicio');
  const [mounted, setMounted] = useState(INITIAL_MOUNT);
  const [enterDirection, setEnterDirection] = useState(0);
  const [stackOrder, setStackOrder] = useState(1);
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;

  const selectTab = useCallback((next: OrbitTabId) => {
    if (next === tab) return;
    setEnterDirection(tabSlideDirection(tab, next));
    setStackOrder((n) => n + 1);
    setMounted((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
    setTab(next);
  }, [tab]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {mounted.inicio ? (
          <TabPane visible={tab === 'inicio'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <HomeScreen
              user={user}
              recents={sessions}
              draft={draft}
              onChange={onDraftChange}
              onSend={onSendFromHome}
              onSuggestion={onSuggestion}
              onOpenRecent={onOpenSession}
              onPrefetchSession={onPrefetchSession}
              onDeleteSession={onDeleteSession}
              onVoiceSend={onVoiceSend}
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

        {mounted.lumen ? (
          <TabPane visible={tab === 'lumen'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <PlaceholderScreen
              title="Lumen"
              subtitle="Trilhas e mapa estelar — sua jornada de aprendizagem com a Luna."
              icon="sparkles"
            />
          </TabPane>
        ) : null}

        {mounted.conta ? (
          <TabPane visible={tab === 'conta'} enterDirection={enterDirection} stackOrder={stackOrder}>
            <AccountScreen
              displayName={user.name}
              initials={user.initials}
              email={email}
              photoURL={photoURL}
              uid={uid}
              isAnonymous={isAnonymous}
              authError={authError}
              onResetSession={onResetSession}
            />
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
