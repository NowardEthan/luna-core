import React, { memo, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Composer } from '../components/Composer';
import { ComposerDock } from '../components/ComposerDock';
import { ConversationRow } from '../components/ConversationRow';
import { ConversationSelectionBar } from '../components/ConversationSelectionBar';
import { SuggestionCard } from '../components/SuggestionCard';
import { SessionItem, UserProfile, suggestions, VoiceClip } from '../data/fixtures';
import { useConversationSelection } from '../hooks/useConversationSelection';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia,';
  if (h >= 12 && h < 19) return 'Boa tarde,';
  return 'Boa noite,';
}

interface Props {
  user: UserProfile;
  recents: SessionItem[];
  draft: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onSuggestion: (t: string) => void;
  onOpenRecent: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onVoiceSend: (clip: VoiceClip) => void;
}

export const HomeScreen = memo(function HomeScreen({
  user,
  recents,
  draft,
  onChange,
  onSend,
  onSuggestion,
  onOpenRecent,
  onPrefetchSession,
  onDeleteSession,
  onVoiceSend,
}: Props) {
  const keyboardHeight = useKeyboardHeight();
  const headerTopPad = useHeaderTopPadding(10);
  const keyboardOpen = keyboardHeight > 0;
  const selection = useConversationSelection();

  const handleConfirmDelete = useCallback(() => {
    for (const id of selection.selectedIds) {
      onDeleteSession(id);
    }
    selection.exit();
  }, [onDeleteSession, selection]);

  return (
    <View style={[styles.container, { paddingTop: headerTopPad, paddingBottom: keyboardHeight }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.top}>
          <LinearGradient
            colors={[tokens.accentMid, tokens.accentDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{user.initials}</Text>
          </LinearGradient>
          <Text style={type.greeting}>{greeting()}</Text>
          <Text style={type.displayName}>{user.name}</Text>
          {!keyboardOpen ? (
            <Text style={type.tagline}>O que vamos explorar hoje?</Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.flex} />

      {!keyboardOpen && recents.length > 0 && (
        <View style={styles.recents}>
          <ConversationSelectionBar
            visible={selection.active}
            count={selection.count}
            title={selection.summaryTitle}
            confirmingDelete={selection.confirmingDelete}
            onClose={selection.exit}
            onDelete={selection.requestDelete}
            onConfirmDelete={handleConfirmDelete}
            onCancelConfirm={selection.cancelDelete}
          />
          {!selection.active ? (
            <Text style={[type.section, styles.sectionPad]}>Recentes</Text>
          ) : null}
          {recents.slice(0, 2).map((s) => {
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
      )}

      {!keyboardOpen && (
        <View style={styles.suggestionsBlock}>
          <Text style={[type.section, styles.sectionPad]}>Sugestões</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
            keyboardShouldPersistTaps="handled"
          >
            {suggestions.map((s) => (
              <SuggestionCard key={s.text} text={s.text} icon={s.icon} onPress={() => onSuggestion(s.text)} />
            ))}
          </ScrollView>
        </View>
      )}

      <ComposerDock>
        <Composer
          value={draft}
          onChange={onChange}
          onSend={onSend}
          onVoiceResult={onVoiceSend}
          placeholder="Toque para começar com a Luna"
        />
      </ComposerDock>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  top: { flexShrink: 0 },
  flex: { flex: 1, minHeight: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarText: { color: tokens.onAccent, fontSize: 17, fontWeight: '700' },
  recents: { gap: 8, marginBottom: 18 },
  suggestionsBlock: { marginBottom: 14 },
  sectionPad: { marginBottom: 10 },
  suggestions: { gap: 10, paddingRight: 6 },
});
