import React, { memo, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Composer } from '../components/Composer';
import { ComposerDock } from '../components/ComposerDock';
import { ConversationRow } from '../components/ConversationRow';
import { ConversationSelectionBar } from '../components/ConversationSelectionBar';
import { HomeFeatureGrid } from '../components/HomeFeatureGrid';
import { LunaAvatar } from '../components/LunaAvatar';
import { UserAvatarButton } from '../components/UserAvatarButton';
import { SessionItem, UserProfile, VoiceClip } from '../data/fixtures';
import { useConversationSelection } from '../hooks/useConversationSelection';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { UsageQuotaPill } from '../components/billing/UsageQuotaPill';
import { tokens } from '../theme/tokens';
import { layout } from '../theme/layout';
import { type } from '../theme/typography';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia,';
  if (h >= 12 && h < 19) return 'Boa tarde,';
  return 'Boa noite,';
}

interface Props {
  user: UserProfile;
  avatarUrl?: string | null;
  recents: SessionItem[];
  draft: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onOpenRecent: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onVoiceSend: (clip: VoiceClip) => void;
  onOpenPlans?: () => void;
  onOpenProfile?: () => void;
  onOpenConversas?: () => void;
}

export const HomeScreen = memo(function HomeScreen({
  user,
  avatarUrl,
  recents,
  draft,
  onChange,
  onSend,
  onOpenRecent,
  onPrefetchSession,
  onDeleteSession,
  onVoiceSend,
  onOpenPlans,
  onOpenProfile,
  onOpenConversas,
}: Props) {
  const lunaUsage = useLunaUsageContext();
  const headerTopPad = useHeaderTopPadding(8);
  const selection = useConversationSelection();

  const showQuotaPill = lunaUsage.quotaApplies && !lunaUsage.usage.loading;

  const handleConfirmDelete = useCallback(() => {
    for (const id of selection.selectedIds) {
      onDeleteSession(id);
    }
    selection.exit();
  }, [onDeleteSession, selection]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerTopPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.topBar}>
          <View style={styles.topBarSide} />
          <UserAvatarButton
            initials={user.initials}
            avatarUrl={avatarUrl}
            size={42}
            onPress={onOpenProfile}
          />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none">
            <LinearGradient
              colors={['rgba(75,117,242,0.28)', 'rgba(75,117,242,0)']}
              style={styles.heroGlowGradient}
            />
          </View>
          <View style={styles.lunaFrame}>
            <LunaAvatar size={56} zoom={1.12} />
          </View>
          <Text style={[type.greeting, styles.heroGreeting]}>{greeting()}</Text>
          <Text style={[type.displayName, styles.heroName]} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={[type.tagline, styles.heroTagline]}>O que vamos explorar hoje?</Text>
        </View>

        {recents.length > 0 || selection.active ? (
          <View style={styles.section}>
            {!selection.active ? (
              <View style={styles.sectionHeader}>
                <Text style={type.section}>Recentes</Text>
                {recents.length > 0 && onOpenConversas ? (
                  <Pressable
                    onPress={onOpenConversas}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Ver todas as conversas"
                  >
                    <Text style={styles.sectionAction}>Ver todas</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <ConversationSelectionBar
                visible
                count={selection.count}
                title={selection.summaryTitle}
                confirmingDelete={selection.confirmingDelete}
                onClose={selection.exit}
                onDelete={selection.requestDelete}
                onConfirmDelete={handleConfirmDelete}
                onCancelConfirm={selection.cancelDelete}
              />
            )}

            <View style={styles.recents}>
              {recents.slice(0, 3).map((s) => {
                const selected = selection.isSelected(s.id);
                return (
                  <ConversationRow
                    key={s.id}
                    session={s}
                    selected={selected}
                    selectionMode={selection.active}
                    onPress={() => {
                      if (selection.active) {
                        selection.toggle(s.id, s.title);
                        return;
                      }
                      onOpenRecent(s.id);
                    }}
                    onPressIn={() => {
                      if (!selection.active) onPrefetchSession?.(s.id);
                    }}
                    onLongPress={() => {
                      if (selection.active) {
                        selection.toggle(s.id, s.title);
                        return;
                      }
                      selection.enter(s.id, s.title);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[type.section, styles.sectionLabel]}>Ferramentas da Luna</Text>
          <HomeFeatureGrid />
        </View>
      </ScrollView>

      <View style={styles.composerZone}>
        <ComposerDock>
          {showQuotaPill ? (
            <View style={styles.quotaPillRow}>
              <UsageQuotaPill
                usage={lunaUsage.usage}
                remaining={lunaUsage.remaining}
                exceeded={lunaUsage.isExceeded}
                onPress={
                  lunaUsage.isExceeded || (lunaUsage.remaining ?? 0) <= 50
                    ? onOpenPlans
                    : undefined
                }
              />
            </View>
          ) : null}
          <Composer
            value={draft}
            onChange={onChange}
            onSend={onSend}
            onVoiceResult={onVoiceSend}
            placeholder="Escreva para a Luna…"
            editable={!lunaUsage.isExceeded}
          />
        </ComposerDock>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 12,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 44,
    marginBottom: 4,
  },
  topBarSide: { flex: 1 },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 22,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -12,
    width: 220,
    height: 140,
    alignSelf: 'center',
  },
  heroGlowGradient: {
    flex: 1,
    borderRadius: 110,
  },
  lunaFrame: {
    marginBottom: 14,
    shadowColor: tokens.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroGreeting: {
    textAlign: 'center',
    marginBottom: 2,
  },
  heroName: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  heroTagline: {
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  quotaPillRow: {
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  sectionAction: {
    color: tokens.accentBright,
    fontSize: 13,
    fontWeight: '600',
  },
  recents: { gap: 8 },
  composerZone: {
    position: 'relative',
  },
});
