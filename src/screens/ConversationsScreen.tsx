import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import {
  ConversationRow,
  TrashConversationRow,
} from '../components/ConversationRow';
import {
  ConversationOrganizeSheet,
  type OrganizeSheetAction,
} from '../components/ConversationOrganizeSheet';
import { ConversationNameSheet } from '../components/ConversationNameSheet';
import {
  ConversationSelectionBar,
  TrashSelectionBar,
} from '../components/ConversationSelectionBar';
import { SessionItem } from '../data/fixtures';
import {
  useConversationSelection,
  useTrashSelection,
} from '../hooks/useConversationSelection';
import { useConversationOrganize } from '../hooks/useConversationOrganize';
import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import type { TrashSessionItem } from '../lib/firebase/firestoreTrash';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  sessions: SessionItem[];
  trashSessions: TrashSessionItem[];
  syncError?: string | null;
  uid: string | null;
  cloudEnabled: boolean;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRestoreSession: (id: string) => void;
  onPermanentDeleteTrash: (id: string) => void;
  onRenameActiveTitle?: (conversationId: string, title: string) => void;
}

const SessionRow = memo(function SessionRow({
  session,
  selection,
  onOpenSession,
  onPrefetchSession,
  onMenuPress,
}: {
  session: SessionItem;
  selection: ReturnType<typeof useConversationSelection>;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onMenuPress: (session: SessionItem) => void;
}) {
  const selected = selection.isSelected(session.id);

  const handlePress = useCallback(() => {
    if (selection.active) {
      selection.toggle(session.id, session.title);
      return;
    }
    onOpenSession(session.id);
  }, [onOpenSession, selection, session.id, session.title]);

  const handleLongPress = useCallback(() => {
    if (selection.active) {
      selection.toggle(session.id, session.title);
      return;
    }
    selection.enter(session.id, session.title);
  }, [selection, session.id, session.title]);

  const prefetch = useCallback(() => {
    if (!selection.active) onPrefetchSession?.(session.id);
  }, [onPrefetchSession, selection.active, session.id]);

  return (
    <View style={styles.rowWrap}>
      <ConversationRow
        session={session}
        selected={selected}
        selectionMode={selection.active}
        onPress={handlePress}
        onPressIn={prefetch}
        onLongPress={handleLongPress}
        onMenuPress={selection.active ? undefined : () => onMenuPress(session)}
      />
    </View>
  );
});

const TrashListRow = memo(function TrashListRow({
  item,
  trashSelection,
}: {
  item: TrashSessionItem;
  trashSelection: ReturnType<typeof useTrashSelection>;
}) {
  const selected = trashSelection.isSelected(item.id);
  const session: SessionItem = {
    id: item.id,
    title: item.title,
    preview: item.preview,
    updatedAt: item.updatedAt,
  };

  return (
    <View style={styles.trashItemWrap}>
      <TrashConversationRow
        session={session}
        selected={selected}
        selectionMode={trashSelection.active}
        meta={`Apagada ${item.deletedAtLabel} · ${item.messageCount} msg`}
        onPress={() => {
          if (trashSelection.active) trashSelection.toggle(item.id, item.title);
        }}
        onLongPress={() => {
          if (trashSelection.active) {
            trashSelection.toggle(item.id, item.title);
            return;
          }
          trashSelection.enter(item.id, item.title);
        }}
      />
    </View>
  );
});

export const ConversationsScreen = memo(function ConversationsScreen({
  sessions,
  trashSessions,
  syncError,
  uid,
  cloudEnabled,
  onOpenSession,
  onPrefetchSession,
  onDeleteSession,
  onRestoreSession,
  onPermanentDeleteTrash,
  onRenameActiveTitle,
}: Props) {
  const headerTopPad = useHeaderTopPadding(10);
  const [trashOpen, setTrashOpen] = useState(false);
  const [organizeSession, setOrganizeSession] = useState<SessionItem | null>(null);
  const [renameSessionTarget, setRenameSessionTarget] = useState<SessionItem | null>(null);
  const [query, setQuery] = useState('');

  const selection = useConversationSelection();
  const trashSelection = useTrashSelection();

  // Mantido só para renomear (renameSession). Pastas/drag-drop moveram-se para o
  // futuro separador Projetos — aqui a lista é plana + busca.
  const organize = useConversationOrganize({ uid, cloudEnabled, sessions, onRenameActiveTitle });

  const allSessions = organize.sessions;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSessions;
    return allSessions.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) || s.preview?.toLowerCase().includes(q),
    );
  }, [allSessions, query]);

  const handleConfirmDelete = useCallback(() => {
    for (const id of selection.selectedIds) {
      onDeleteSession(id);
    }
    selection.exit();
  }, [onDeleteSession, selection]);

  const handleTrashConfirm = useCallback(() => {
    if (!trashSelection.pendingAction) return;
    for (const id of trashSelection.selectedIds) {
      if (trashSelection.pendingAction === 'restore') {
        onRestoreSession(id);
      } else {
        onPermanentDeleteTrash(id);
      }
    }
    trashSelection.exit();
  }, [onPermanentDeleteTrash, onRestoreSession, trashSelection]);

  const handleOrganizeAction = useCallback(
    (action: OrganizeSheetAction) => {
      if (!organizeSession) return;
      const session = organizeSession;
      setOrganizeSession(null);
      if (action === 'rename') {
        setRenameSessionTarget(session);
        return;
      }
      if (action === 'select') {
        selection.enter(session.id, session.title);
        return;
      }
      if (action === 'delete') {
        onDeleteSession(session.id);
      }
    },
    [onDeleteSession, organizeSession, selection],
  );

  const renderItem = useCallback(
    ({ item }: { item: SessionItem }) => (
      <SessionRow
        session={item}
        selection={selection}
        onOpenSession={onOpenSession}
        onPrefetchSession={onPrefetchSession}
        onMenuPress={setOrganizeSession}
      />
    ),
    [onOpenSession, onPrefetchSession, selection],
  );

  const listFooter =
    !query && trashSessions.length > 0 ? (
      <View style={styles.trashSection}>
        <Pressable
          onPress={() => setTrashOpen((v) => !v)}
          style={({ pressed }) => [styles.trashToggle, pressed && styles.trashTogglePressed]}
        >
          <Ionicons name="trash-outline" size={16} color={tokens.textMid} />
          <Text style={styles.trashToggleText}>Lixeira ({trashSessions.length})</Text>
          <Ionicons name={trashOpen ? 'chevron-up' : 'chevron-down'} size={16} color={tokens.textLow} />
        </Pressable>
        {trashOpen
          ? trashSessions.map((item) => (
              <TrashListRow key={item.id} item={item} trashSelection={trashSelection} />
            ))
          : null}
      </View>
    ) : null;

  const headerHidden = selection.active || trashSelection.active;
  const isEmpty = allSessions.length === 0 && trashSessions.length === 0;

  return (
    <View style={[styles.container, { paddingTop: headerTopPad }]}>
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

      <TrashSelectionBar
        visible={trashSelection.active && !selection.active}
        count={trashSelection.count}
        title={trashSelection.summaryTitle}
        pendingAction={trashSelection.pendingAction}
        onClose={trashSelection.exit}
        onRestore={() => trashSelection.requestAction('restore')}
        onPermanentDelete={() => trashSelection.requestAction('permanent')}
        onConfirm={handleTrashConfirm}
        onCancelConfirm={trashSelection.cancelAction}
      />

      {!headerHidden ? (
        <View style={styles.topHeader}>
          <View style={styles.topHeaderText}>
            <Text style={type.displayName}>Conversas</Text>
            <Text style={type.tagline}>Continue de onde parou</Text>
          </View>
          {allSessions.length > 0 ? (
            <Pressable
              onPress={() => selection.arm()}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityLabel="Selecionar conversas"
            >
              <Ionicons name="checkbox-outline" size={20} color={tokens.textMid} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      {syncError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {!headerHidden && allSessions.length > 0 ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color={tokens.textLow} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar conversas"
            placeholderTextColor={tokens.textLow}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={17} color={tokens.textLow} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma conversa ainda</Text>
          <Text style={styles.emptyHint}>Suas conversas com a Luna aparecem aqui.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            query ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.emptyTitle}>Nada encontrado</Text>
                <Text style={styles.emptyHint}>Nenhuma conversa combina com “{query.trim()}”.</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEnabled={!selection.confirmingDelete}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android' && !selection.active}
        />
      )}

      <ConversationOrganizeSheet
        visible={organizeSession != null}
        title={organizeSession?.title ?? ''}
        showMove={false}
        showPin={false}
        onClose={() => setOrganizeSession(null)}
        onAction={handleOrganizeAction}
      />

      <ConversationNameSheet
        visible={renameSessionTarget != null}
        title={ORGANIZE_COPY.renameConversationTitle}
        initialValue={renameSessionTarget?.title ?? ''}
        placeholder={ORGANIZE_COPY.conversationNamePlaceholder}
        onClose={() => setRenameSessionTarget(null)}
        onSave={(name) => {
          if (!renameSessionTarget) return;
          void organize.renameSession(renameSessionTarget.id, name);
          setRenameSessionTarget(null);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22, position: 'relative' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  topHeaderText: { flex: 1, minWidth: 0 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.surfaceRaised,
    marginTop: 4,
  },
  iconBtnPressed: { opacity: 0.85 },
  headerSpacer: { height: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
  },
  searchInput: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 15,
    padding: 0,
  },
  list: { paddingTop: 14, paddingBottom: 16 },
  rowWrap: { marginBottom: 8 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: tokens.errorSoft,
  },
  errorText: { color: tokens.error, fontSize: 13, lineHeight: 18 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 80, gap: 8 },
  searchEmpty: { paddingTop: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { color: tokens.textHigh, fontSize: 17, fontWeight: '600' },
  emptyHint: { color: tokens.textMid, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  trashSection: { marginTop: 16, marginBottom: 8, paddingTop: 8 },
  trashToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  trashTogglePressed: { opacity: 0.85 },
  trashToggleText: { flex: 1, color: tokens.textMid, fontSize: 14, fontWeight: '600' },
  trashItemWrap: { marginBottom: 8 },
});
