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
import { HomeFeatureGrid } from '../components/HomeFeatureGrid';
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
  const usageState = lunaUsage.isExceeded
    ? 'Limite atingido'
    : lunaUsage.isReducedMode
      ? 'Modo reduzido'
      : 'Pronta';

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

        <View style={styles.heroPanel}>
          <View style={styles.heroMain}>
            <LunaAvatar size={50} zoom={1.12} />
            <View style={styles.heroCopy}>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    (lunaUsage.isExceeded || lunaUsage.isReducedMode) && styles.statusDotWarn,
                  ]}
                />
                <Text style={styles.statusText}>{usageState}</Text>
              </View>
              <Text style={styles.heroTitle}>Converse com a Luna</Text>
              <Text style={styles.heroSubtitle}>
                Comece uma pergunta nova ou continue uma conversa recente.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <Pressable
            onPress={handleFocusComposer}
            style={({ pressed }) => [styles.quickCard, pressed && styles.quickCardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Começar conversa"
          >
            <View style={styles.quickIconPrimary}>
              <Ionicons name="create-outline" size={18} color={tokens.onAccent} />
            </View>
            <Text style={styles.quickTitle}>Começar</Text>
            <Text style={styles.quickSub} numberOfLines={2}>
              Escreva ou grave no composer
            </Text>
          </Pressable>

          <Pressable
            onPress={onOpenConversas}
            disabled={!onOpenConversas}
            style={({ pressed }) => [
              styles.quickCard,
              pressed && onOpenConversas && styles.quickCardPressed,
              !onOpenConversas && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Abrir conversas"
          >
            <View style={styles.quickIcon}>
              <Ionicons name="chatbubbles-outline" size={18} color={tokens.accentBright} />
            </View>
            <Text style={styles.quickTitle}>Conversas</Text>
            <Text style={styles.quickSub} numberOfLines={2}>
              {hasRecents ? `${recents.length} no histórico` : 'Histórico vazio'}
            </Text>
          </Pressable>
        </View>

        {hasRecents || selection.active ? (
          <View style={styles.section}>
            {!selection.active ? (
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Continue</Text>
                  <Text style={styles.sectionSubtitle}>Últimas conversas</Text>
                </View>
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
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recursos</Text>
              <Text style={styles.sectionSubtitle}>O que a Luna entende hoje</Text>
            </View>
          </View>
          <HomeFeatureGrid />
        </View>
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
    marginBottom: 14,
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
  heroPanel: {
    borderRadius: 8,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
    padding: 14,
  },
  heroMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.online,
  },
  statusDotWarn: { backgroundColor: tokens.warning },
  statusText: {
    color: tokens.textMid,
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: tokens.textMid,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 24,
  },
  quickCard: {
    flex: 1,
    minHeight: 106,
    borderRadius: 8,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
    padding: 12,
  },
  quickCardPressed: { backgroundColor: tokens.surfaceRaised },
  quickIconPrimary: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accent,
    marginBottom: 10,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
    marginBottom: 10,
  },
  quickTitle: { color: tokens.textHigh, fontSize: 15, fontWeight: '700' },
  quickSub: { color: tokens.textMid, fontSize: 12, lineHeight: 16, marginTop: 3 },
  disabled: { opacity: 0.5 },
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
  sectionSubtitle: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
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
  composerZone: {
    position: 'relative',
  },
});
