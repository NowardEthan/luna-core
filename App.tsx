import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreenStack } from './src/components/ChatScreenStack';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OrbitBackground } from './src/components/OrbitBackground';
import { MainShell } from './src/screens/MainShell';
import { ThreadScreen } from './src/screens/ThreadScreen';
import { useOrbitChat } from './src/data/useOrbitChat';
import { demoUser } from './src/data/fixtures';
import { LunaAuthProvider, useLunaAuth } from './src/hooks/useLunaAuth';
import { LunaProviderProvider } from './src/hooks/LunaProviderContext';
import { MotionProfileProvider, useMotionProfile } from './src/hooks/useMotionProfile';
import { motion, springs } from './src/lib/motionTokens';
import { tokens } from './src/theme/tokens';

/**
 * Fundo com profundidade coordenada: recua (escala + dim) quando uma conversa
 * está aberta, comandado pela mesma mola do push. Transform puro sobre o SVG
 * memoizado — sem re-render nem flicker.
 */
function DepthBackground({ isThread }: { isThread: boolean }) {
  const { interactions, reduceMotion } = useMotionProfile();
  const depth = useRef(new Animated.Value(isThread ? 1 : 0)).current;

  useEffect(() => {
    const target = isThread ? 1 : 0;
    if (!interactions || reduceMotion) {
      depth.setValue(target);
      return;
    }
    const anim = Animated.spring(depth, {
      toValue: target,
      ...(isThread ? springs.screen : springs.screenBack),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [depth, interactions, isThread, reduceMotion]);

  const scale = depth.interpolate({ inputRange: [0, 1], outputRange: [1, motion.bgDepthScale] });
  const opacity = depth.interpolate({ inputRange: [0, 1], outputRange: [1, motion.bgDepthOpacity] });
  const translateY = depth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, motion.bgDepthTranslateY],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }, { translateY }] }]}
    >
      <OrbitBackground variant="home" />
    </Animated.View>
  );
}

function OrbitApp() {
  const auth = useLunaAuth();
  const chat = useOrbitChat();
  const visitedThread = useRef(chat.screen === 'thread');
  if (chat.screen === 'thread') visitedThread.current = true;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setTranslucent(false);
    RNStatusBar.setBackgroundColor('#0E1014', true);
    RNStatusBar.setBarStyle('light-content');
  }, []);

  const user = auth.user
    ? {
        name: auth.user.displayName || auth.user.email?.split('@')[0] || 'Você',
        initials: (
          auth.user.displayName?.[0] ||
          auth.user.email?.[0] ||
          'L'
        ).toUpperCase(),
      }
    : demoUser;

  if (auth.configured && auth.loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={tokens.accent} size="large" />
        <Text style={styles.bootText}>Conectando à Luna…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <DepthBackground isThread={chat.screen === 'thread'} />

      <ChatScreenStack
        screen={chat.screen}
        threadEnterKey={chat.threadEnterKey}
        threadEnterMode={chat.threadEnterMode}
        home={
          <MainShell
            user={user}
            uid={auth.uid}
            email={auth.user?.email ?? null}
            photoURL={auth.user?.photoURL ?? null}
            isAnonymous={auth.user?.isAnonymous ?? true}
            authError={auth.error}
            onResetSession={auth.signOutAndReset}
            sessions={chat.recents}
            syncError={chat.syncError}
            draft={chat.draft}
            onDraftChange={chat.setDraft}
            onSendFromHome={chat.sendFromHome}
            onSuggestion={chat.sendSuggestion}
            onOpenSession={chat.openSession}
            onPrefetchSession={chat.prefetchSession}
            onDeleteSession={(id) => void chat.deleteConversation(id)}
            trashSessions={chat.trashSessions}
            onRestoreSession={(id) => void chat.restoreConversation(id)}
            onPermanentDeleteTrash={(id) => void chat.permanentDeleteTrash(id)}
            onNewChat={chat.startNewChat}
            onVoiceSend={chat.sendVoiceMessage}
          />
        }
        thread={
          visitedThread.current ? (
            <ThreadScreen
              title={chat.title}
              sessionKey={chat.activeSessionId}
              threadVisible={chat.screen === 'thread'}
              hydrating={chat.hydrating}
              messages={chat.messages}
              loading={chat.loading}
              draft={chat.draft}
              onChange={chat.setDraft}
              onSend={chat.sendFromThread}
              onBack={chat.backToHome}
              onNewChat={chat.startNewChat}
              onVoiceSend={chat.sendVoiceMessage}
              onTranscribe={chat.requestTranscript}
              messageFeedback={chat.messageFeedback}
              onMessageAction={(action, id, opts) => void chat.runMessageAction(action, id, opts)}
              onBranchFromMessage={chat.branchFromMessage}
              onTruncateFromMessage={(index, draft) =>
                void chat.truncateThreadFromIndex(index, draft)
              }
              archivedBranch={chat.archivedBranch}
              branchPoint={chat.branchPoint}
              activeTimeline={chat.activeTimeline}
              forkSource={chat.forkSource}
              childForks={chat.childForks}
              onToggleArchivedBranch={chat.toggleArchivedBranch}
              onExpandInactiveBranch={chat.expandInactiveBranch}
              onSwitchBranchTimeline={chat.switchBranchTimeline}
              onDeleteBranchTimeline={chat.deleteBranchTimeline}
              onDeleteForkBranch={(id, title) => void chat.deleteForkBranch(id, title)}
              onOpenForkSource={chat.openForkSource}
              onOpenSession={chat.openSession}
              messageReference={chat.messageReference}
              onSetMessageReference={chat.setMessageReference}
              onReferenceFeedback={chat.setMessageFeedback}
            />
          ) : null
        }
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <LunaAuthProvider>
          <LunaProviderProvider>
            <MotionProfileProvider>
              <OrbitApp />
            </MotionProfileProvider>
          </LunaProviderProvider>
        </LunaAuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1014' },
  boot: {
    flex: 1,
    backgroundColor: '#0E1014',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bootText: { color: tokens.textMid, fontSize: 15 },
});
