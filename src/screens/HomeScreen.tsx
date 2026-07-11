import React, { memo, useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Composer, type ComposerHandle } from '../components/Composer';
import { ComposerDock } from '../components/ComposerDock';
import { ConversationRow } from '../components/ConversationRow';
import { ConversationSelectionBar } from '../components/ConversationSelectionBar';
import { LunaAvatar } from '../components/LunaAvatar';
import { UserAvatarButton } from '../components/UserAvatarButton';
import { SessionItem, UserProfile, VoiceClip } from '../data/fixtures';
import { useConversationSelection } from '../hooks/useConversationSelection';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { UsageLimitChip } from '../components/billing/UsageLimitChip';
import { quotaComposerPlaceholder } from '../features/billing/limitsSummary';
import { tokens } from '../theme/tokens';
import { layout } from '../theme/layout';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 19) return 'Boa tarde';
  return 'Boa noite';
}

const RECENTS_ON_HOME = 5;

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
  onOpenLimits?: () => void;
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
  onOpenLimits,
  onOpenProfile,
  onOpenConversas,
}: Props) {
  const lunaUsage = useLunaUsageContext();
  const headerTopPad = useHeaderTopPadding(8);
  const selection = useConversationSelection();
  const composerRef = useRef<ComposerHandle>(null);

  const handleFocusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const handleConfirmDelete = useCallback(() => {
    for (const id of selection.selectedIds) {
      onDeleteSession(id);
    }
    selection.exit();
  }, [onDeleteSession, selection]);

  const hasRecents = recents.length > 0;
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

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
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>{greeting()}</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <UserAvatarButton
            initials={user.initials}
            avatarUrl={avatarUrl}
            size={40}
            onPress={onOpenProfile}
          />
        </View>

        {hasRecents || selection.active ? (
          <View style={styles.section}>
            {!selection.active ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Conversas recentes</Text>
                {hasRecents && onOpenConversas ? (
                  <Pressable
                    onPress={onOpenConversas}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Ver todas as conversas"
                    style={({ pressed }) => [styles.sectionActionHit, pressed && styles.sectionActionPressed]}
                  >
                    <Text style={styles.sectionAction}>Ver todas</Text>
                    <Ionicons name="chevron-forward" size={15} color={tokens.accentBright} />
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
              {recents.slice(0, RECENTS_ON_HOME).map((s) => {
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
        ) : (
          <Pressable
            style={styles.empty}
            onPress={handleFocusComposer}
            accessibilityRole="button"
            accessibilityLabel="Começar a conversar"
          >
            <LunaAvatar size={72} zoom={1.12} />
            <Text style={styles.emptyTitle}>Sobre o que vamos conversar?</Text>
            <Text style={styles.emptySubtitle}>Escreva ou fale com a Luna aqui embaixo.</Text>
          </Pressable>
        )}
      </ScrollView>

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
            value={draft}
            onChange={onChange}
            onSend={onSend}
            onVoiceResult={onVoiceSend}
            placeholder={quotaComposerPlaceholder(
              lunaUsage.usage,
              lunaUsage.isExceeded,
              'Escreva para a Luna...',
              lunaUsage.isReducedMode,
            )}
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
    paddingBottom: 18,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginBottom: 20,
  },
  topCopy: { flex: 1, minWidth: 0, paddingRight: 14 },
  eyebrow: {
    color: tokens.textLow,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userName: {
    color: tokens.textHigh,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: tokens.textHigh,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionActionHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 5,
    paddingLeft: 8,
  },
  sectionActionPressed: { opacity: 0.75 },
  sectionAction: {
    color: tokens.accentBright,
    fontSize: 13,
    fontWeight: '700',
  },
  recents: { gap: 8 },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 4,
  },
  emptyTitle: {
    color: tokens.textHigh,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  composerZone: {
    position: 'relative',
  },
});
