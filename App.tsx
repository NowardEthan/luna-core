import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Platform, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreenStack } from './src/components/ChatScreenStack';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineBanner } from './src/components/OfflineBanner';
import { OrbitBackground } from './src/components/OrbitBackground';
import { MainShell } from './src/screens/MainShell';
import { ThreadScreen } from './src/screens/ThreadScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { useOrbitChat } from './src/data/useOrbitChat';
import { demoUser } from './src/data/fixtures';
import { ComposerSessionProvider } from './src/hooks/ComposerSessionContext';
import { LunaAuthProvider, useLunaAuth } from './src/hooks/useLunaAuth';
import { LunaUsageProvider } from './src/hooks/LunaUsageContext';
import { LunaProviderProvider, useLunaProvider } from './src/hooks/LunaProviderContext';
import { useNetworkStatus } from './src/hooks/useNetworkStatus';
import { useUserProfile } from './src/hooks/useUserProfile';
import { MotionProfileProvider, useMotionProfile } from './src/hooks/useMotionProfile';
import { motion, springs } from './src/lib/motionTokens';
import { tokens } from './src/theme/tokens';
import { useAndroidBackHandler } from './src/hooks/useAndroidBackHandler';

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
  const lunaProvider = useLunaProvider();
  const network = useNetworkStatus();
  const profile = useUserProfile(auth.user, demoUser.name);
  const visitedThread = useRef(chat.screen === 'thread');
  if (chat.screen === 'thread') visitedThread.current = true;

  const handleRootBack = useCallback((): boolean => {
    if (chat.screen === 'thread') {
      chat.backToHome();
      return true;
    }
    if (chat.mainTab !== 'inicio') {
      chat.setMainTab('inicio');
      return true;
    }
    return false;
  }, [chat.screen, chat.mainTab, chat.backToHome, chat.setMainTab]);

  useAndroidBackHandler(handleRootBack, Boolean(auth.user) && chat.navReady);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setTranslucent(false);
    RNStatusBar.setBackgroundColor('#0E1014', true);
    RNStatusBar.setBarStyle('light-content');
  }, []);

  const displayName = profile.displayName || auth.user?.email?.split('@')[0] || 'Você';
  const user = auth.user
    ? {
        name: displayName,
        initials: (() => {
          const parts = displayName.trim().split(/\s+/).filter(Boolean);
          if (parts.length === 0) return 'V';
          if (parts.length === 1) return parts[0]![0]!.toUpperCase();
          return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
        })(),
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

  if (auth.configured && !auth.user) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <OrbitBackground variant="home" />
        <WelcomeScreen
          onContinueAsGuest={auth.continueAsGuest}
          authError={auth.error}
        />
      </View>
    );
  }

  if (!chat.navReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={tokens.accent} size="large" />
        <Text style={styles.bootText}>Recuperando sessão…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <OfflineBanner
        deviceOffline={network.offline}
        apiReachable={!lunaProvider.loaded || lunaProvider.apiReachable}
        onRetry={() => void lunaProvider.refreshFromServer()}
      />
      <DepthBackground isThread={chat.screen === 'thread'} />

      <ChatScreenStack
        screen={chat.screen}
        threadEnterKey={chat.threadEnterKey}
        threadEnterMode={chat.threadEnterMode}
        home={
          <MainShell
            user={user}
            avatarUrl={profile.avatarUrl}
            uid={auth.uid}
            email={auth.user?.email ?? null}
            photoURL={auth.user?.photoURL ?? null}
            isAnonymous={auth.user?.isAnonymous ?? true}
            authError={auth.error}
            onResetSession={auth.signOutAndReset}
            sessions={chat.recents}
            syncError={chat.syncError}
            mainTab={chat.mainTab}
            onMainTabChange={chat.setMainTab}
            draft={chat.draft}
            onDraftChange={chat.setDraft}
            onSendFromHome={chat.sendFromHome}
            onOpenSession={chat.openSession}
            onPrefetchSession={chat.prefetchSession}
            onDeleteSession={(id) => void chat.deleteConversation(id)}
            trashSessions={chat.trashSessions}
            onRestoreSession={(id) => void chat.restoreConversation(id)}
            onPermanentDeleteTrash={(id) => void chat.permanentDeleteTrash(id)}
            onNewChat={chat.startNewChat}
            onVoiceSend={chat.sendVoiceMessage}
            onOpenPlans={() => chat.setMainTab('definicoes')}
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
              initialScrollY={chat.threadScrollRestore}
              onScrollOffsetChange={chat.onThreadScrollOffset}
              onScrollRestoreApplied={chat.clearThreadScrollRestore}
              onOpenPlans={() => {
                chat.backToHome();
                chat.setMainTab('definicoes');
              }}
              lunaHumorAtual={chat.lunaHumorAtual}
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
          <LunaUsageProvider>
            <ComposerSessionProvider>
              <LunaProviderProvider>
                <MotionProfileProvider>
                  <OrbitApp />
                </MotionProfileProvider>
              </LunaProviderProvider>
            </ComposerSessionProvider>
          </LunaUsageProvider>
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
