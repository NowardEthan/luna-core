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
import {
  useRosary,
  isRosaryRequest,
  type PrayerMode,
  type RosaryMysterySet,
} from './src/hooks/useRosary';
import { classifyRosaryIntentLocal, advanceRosaryState } from './src/lib/rosary/rosaryLogic';
import {
  getComposerPlaceholder,
  getDefaultLunaIntention,
  getIntentionAcknowledgment,
  getKickoffLunaLine,
  getLunaLineAfterUserPrayer,
  getOpeningMessage,
  MYSTERY_SET_LABELS,
} from './src/lib/rosary/rosaryTexts';
import { RosaryModeSheet } from './src/components/RosaryModeSheet';
import { RosarySetSheet } from './src/components/RosarySetSheet';
import { OrbitQuickMenu, type OrbitQuickAction } from './src/components/OrbitQuickMenu';
import { RosaryCalendarSheet } from './src/components/RosaryCalendarSheet';
import type { ComposerSendPayload } from './src/lib/composerAttachmentModel';
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
import { useRosaryJournal } from './src/hooks/useRosaryJournal';

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
  const rosary = useRosary(chat.activeSessionId);
  const lunaProvider = useLunaProvider();
  const [setSheetVisible, setSetSheetVisible] = React.useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = React.useState(false);
  const [calendarVisible, setCalendarVisible] = React.useState(false);
  const [settingsLimitsPending, setSettingsLimitsPending] = React.useState(false);
  const network = useNetworkStatus();
  const profile = useUserProfile(auth.user, demoUser.name);
  const journalNow = new Date();
  const rosaryJournal = useRosaryJournal({
    uid: auth.uid,
    year: journalNow.getFullYear(),
    month: journalNow.getMonth() + 1,
  });
  const visitedThread = useRef(chat.screen === 'thread');
  if (chat.screen === 'thread') visitedThread.current = true;

  const handleOpenLimits = useCallback(() => {
    chat.setMainTab('definicoes');
    setSettingsLimitsPending(true);
    if (chat.screen === 'thread') chat.backToHome();
  }, [chat.backToHome, chat.screen, chat.setMainTab]);

  const handleRootBack = useCallback((): boolean => {
    if (quickMenuOpen) {
      setQuickMenuOpen(false);
      return true;
    }
    if (calendarVisible) {
      setCalendarVisible(false);
      return true;
    }
    if (chat.screen === 'thread') {
      chat.backToHome();
      return true;
    }
    if (chat.mainTab !== 'inicio') {
      chat.setMainTab('inicio');
      return true;
    }
    return false;
  }, [
    calendarVisible,
    chat.screen,
    chat.mainTab,
    chat.backToHome,
    chat.setMainTab,
    quickMenuOpen,
  ]);

  useAndroidBackHandler(handleRootBack, Boolean(auth.user) && chat.navReady);

  useEffect(() => {
    setQuickMenuOpen(false);
  }, [chat.screen]);

  const handleQuickMenuToggle = useCallback(() => {
    setQuickMenuOpen((open) => !open);
  }, []);

  const handleQuickMenuClose = useCallback(() => {
    setQuickMenuOpen(false);
  }, []);

  const handleQuickAction = useCallback(
    (action: OrbitQuickAction) => {
      setQuickMenuOpen(false);
      switch (action) {
        case 'new_chat':
          chat.startNewChat();
          break;
        case 'rosary_calendar':
          setCalendarVisible(true);
          break;
        case 'start_rosary':
          chat.startNewChat();
          rosary.requestStart();
          break;
      }
    },
    [chat, rosary],
  );

  const beginRosarySession = useCallback(
    async (mode: PrayerMode, mysterySet: RosaryMysterySet) => {
      rosary.confirmStartWithMode(mode);
      void rosaryJournal.markTouched(mysterySet);
      await chat.sendRosaryMessage(undefined, getOpeningMessage(mysterySet));
    },
    [chat, rosary, rosaryJournal],
  );

  const handleRosaryToggle = useCallback(() => {
    if (rosary.state.active) {
      rosary.stopRosary();
      void chat.sendRosaryMessage(undefined, 'O terço foi encerrado. Que a paz de Deus esteja contigo.');
      return;
    }
    rosary.requestStart();
  }, [chat, rosary]);

  const handleRosaryLongPress = useCallback(() => {
    if (!rosary.state.active) setSetSheetVisible(true);
  }, [rosary.state.active]);

  const handleRosarySetSelect = useCallback(
    (set: RosaryMysterySet) => {
      setSetSheetVisible(false);
      rosary.requestStart(set);
    },
    [rosary],
  );

  const handleRosaryModeSelect = useCallback(
    (mode: PrayerMode) => {
      const set = rosary.pendingMysterySet ?? rosary.state.mysterySet;
      void beginRosarySession(mode, set);
    },
    [beginRosarySession, rosary.pendingMysterySet, rosary.state.mysterySet],
  );

  const handleRosaryReflection = useCallback(() => {
    if (!rosary.state.active || !rosary.currentMystery) return;
    void chat.sendRosaryReflection({
      mysteryName: rosary.currentMystery.name,
      mysterySetLabel: MYSTERY_SET_LABELS[rosary.state.mysterySet],
      intention: rosary.state.intention || undefined,
    });
  }, [chat, rosary]);

  const handleRosaryToggleMode = useCallback(() => {
    if (!rosary.prayerMode) return;
    rosary.setMode(rosary.prayerMode === 'together' ? 'solo' : 'together');
  }, [rosary]);

  const rosaryPlaceholder = getComposerPlaceholder(rosary.state, rosary.prayerMode);

  const handleSendFromThread = useCallback(
    async (payload: ComposerSendPayload) => {
      const text = payload.text.trim();
      if (!text) return;

      if (rosary.state.active && payload.attachments.length > 0) {
        void chat.sendRosaryMessage(
          undefined,
          'Durante o terço, reza só com texto por agora — os anexos voltam depois.',
        );
        return;
      }

      if (!rosary.state.active && !isRosaryRequest(text)) {
        chat.sendFromThread(payload);
        return;
      }

      const intent = classifyRosaryIntentLocal(text, rosary.state, isRosaryRequest, rosary.prayerMode);

      if (intent.kind === 'start_rosary') {
        if (!rosary.state.active) {
          void chat.sendRosaryMessage(text, 'Claro. Escolhe como queres rezar o terço.');
          rosary.requestStart();
        }
        return;
      }

      if (intent.kind === 'stop_rosary') {
        rosary.stopRosary();
        void chat.sendRosaryMessage(text, 'O terço foi encerrado. Que a paz de Deus esteja contigo.');
        return;
      }

      if (intent.kind === 'intention' && rosary.state.active) {
        const wasIntro = rosary.state.step === 'intro';
        rosary.dispatch({ type: 'set_intention', intention: text });
        if (wasIntro) {
          const mode = rosary.prayerMode ?? 'solo';
          const stateCross = {
            ...rosary.state,
            intention: text,
            step: 'cross' as const,
          };
          void chat.sendRosaryMessage(
            text,
            `${getIntentionAcknowledgment(text, false)}\n\n${getKickoffLunaLine(mode, stateCross)}`,
          );
        } else {
          void chat.sendRosaryMessage(text, getIntentionAcknowledgment(text, false));
        }
        return;
      }

      if (intent.kind === 'kickoff' && rosary.state.active && rosary.state.step === 'intro') {
        const lunaIntention = getDefaultLunaIntention();
        rosary.dispatch({ type: 'set_intention', intention: lunaIntention });
        const mode = rosary.prayerMode ?? 'solo';
        const stateCross = {
          ...rosary.state,
          intention: lunaIntention,
          step: 'cross' as const,
        };
        void chat.sendRosaryMessage(
          text,
          `${getIntentionAcknowledgment(lunaIntention, true)}\n\n${getKickoffLunaLine(mode, stateCross)}`,
        );
        return;
      }

      if (
        intent.kind === 'chat' &&
        rosary.state.active &&
        rosary.state.step === 'intro' &&
        rosary.prayerMode
      ) {
        void chat.sendRosaryMessage(
          text,
          'Diz pela quem queres rezar, ou faz o sinal da cruz para começar.',
        );
        return;
      }

      if (intent.kind === 'prayer' && rosary.state.active && rosary.prayerMode) {
        const prev = rosary.state;
        const mode = rosary.prayerMode;
        const next =
          prev.step === 'intro'
            ? advanceRosaryState(advanceRosaryState(prev))
            : advanceRosaryState(prev);

        if (prev.step === 'intro') {
          rosary.dispatch({ type: 'restore', state: next, prayerMode: mode });
        } else {
          rosary.dispatch({ type: 'advance' });
        }

        if (!next.active && prev.step === 'finished') {
          void rosaryJournal.markCompleted();
          void chat.sendRosaryMessage(
            text,
            'Terço finalizado. Salve, Rainha! Que a paz de Deus esteja contigo.',
          );
          rosary.stopRosary();
          return;
        }

        const lunaText = getLunaLineAfterUserPrayer(mode, next.active ? next : prev);
        void chat.sendRosaryMessage(text, lunaText);
        return;
      }

      chat.sendFromThread(payload);
    },
    [chat, rosary, rosaryJournal],
  );

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
            cloudEnabled={chat.cloudEnabled}
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
            onRenameActiveTitle={chat.renameActiveConversationTitle}
            onVoiceSend={chat.sendVoiceMessage}
            onOpenPlans={() => chat.setMainTab('definicoes')}
            settingsLimitsPending={settingsLimitsPending}
            onSettingsLimitsHandled={() => setSettingsLimitsPending(false)}
            quickMenuOpen={quickMenuOpen}
            onQuickMenuToggle={handleQuickMenuToggle}
            onQuickMenuClose={handleQuickMenuClose}
            onQuickAction={handleQuickAction}
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
              onSend={handleSendFromThread}
              rosaryState={rosary.state}
              rosaryPlaceholder={rosaryPlaceholder}
              onRosaryToggle={handleRosaryToggle}
              onRosaryLongPress={handleRosaryLongPress}
              rosaryBeadCurrent={rosary.beadProgress.current}
              rosaryBeadTotal={rosary.beadProgress.total}
              rosaryMode={rosary.prayerMode}
              onRosaryToggleMode={handleRosaryToggleMode}
              onRosaryStop={() => {
                rosary.stopRosary();
                void chat.sendRosaryMessage(
                  undefined,
                  'O terço foi encerrado. Que a paz de Deus esteja contigo.',
                );
              }}
              onRosaryReflection={handleRosaryReflection}
              onBack={chat.backToHome}
              quickMenuOpen={quickMenuOpen}
              onQuickMenuToggle={handleQuickMenuToggle}
              onNewChat={chat.startNewChat}
              onVoiceSend={chat.sendVoiceMessage}
              onTranscribe={chat.requestTranscript}
              onResend={chat.resendMessage}
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
              onOpenLimits={handleOpenLimits}
              lunaHumorAtual={chat.lunaHumorAtual}
            />
          ) : null
        }
      />
      <RosaryModeSheet
        visible={rosary.modeSheetVisible}
        mysterySet={rosary.pendingMysterySet ?? rosary.state.mysterySet}
        onSelect={handleRosaryModeSelect}
        onCancel={rosary.cancelModeSheet}
      />
      <RosarySetSheet
        visible={setSheetVisible}
        onSelect={handleRosarySetSelect}
        onCancel={() => setSetSheetVisible(false)}
      />
      <OrbitQuickMenu
        visible={quickMenuOpen && chat.screen === 'thread'}
        onClose={handleQuickMenuClose}
        onAction={handleQuickAction}
      />
      <RosaryCalendarSheet
        visible={calendarVisible}
        uid={auth.uid}
        onClose={() => setCalendarVisible(false)}
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
