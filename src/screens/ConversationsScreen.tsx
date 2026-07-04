import React, { memo, useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import {
  ConversationRow,
  TrashConversationRow,
} from '../components/ConversationRow';
import {
  ConversationSelectionBar,
  TrashSelectionBar,
} from '../components/ConversationSelectionBar';
import { SessionItem } from '../data/fixtures';
import {
  useConversationSelection,
  useTrashSelection,
} from '../hooks/useConversationSelection';
import type { TrashSessionItem } from '../lib/firebase/firestoreTrash';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  sessions: SessionItem[];
  trashSessions: TrashSessionItem[];
  syncError?: string | null;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRestoreSession: (id: string) => void;
  onPermanentDeleteTrash: (id: string) => void;
}

const SessionRow = memo(function SessionRow({
  session,
  selection,
  onOpenSession,
  onPrefetchSession,
}: {
  session: SessionItem;
  selection: ReturnType<typeof useConversationSelection>;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
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

  const prefetch = useCallback(
    () => {
      if (!selection.active) onPrefetchSession?.(session.id);
    },
    [onPrefetchSession, selection.active, session.id],
  );

  return (
    <View style={styles.rowWrap}>
      <ConversationRow
        session={session}
        selected={selected}
        selectionMode={selection.active}
        onPress={handlePress}
        onPressIn={prefetch}
        onLongPress={handleLongPress}
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
          if (trashSelection.active) {
            trashSelection.toggle(item.id, item.title);
            return;
          }
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
  onOpenSession,
  onPrefetchSession,
  onDeleteSession,
  onRestoreSession,
  onPermanentDeleteTrash,
}: Props) {
  const headerTopPad = useHeaderTopPadding(10);
  const [trashOpen, setTrashOpen] = useState(false);
  const selection = useConversationSelection();
  const trashSelection = useTrashSelection();

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

  const renderItem = useCallback(
    ({ item }: { item: SessionItem }) => (
      <SessionRow
        session={item}
        selection={selection}
        onOpenSession={onOpenSession}
        onPrefetchSession={onPrefetchSession}
      />
    ),
    [onOpenSession, onPrefetchSession, selection],
  );

  const keyExtractor = useCallback((s: SessionItem) => s.id, []);

  const listHeader =
    trashSessions.length > 0 ? (
      <View style={styles.trashSection}>
        <Pressable
          onPress={() => setTrashOpen((v) => !v)}
          style={({ pressed }) => [styles.trashToggle, pressed && styles.trashTogglePressed]}
        >
          <Ionicons name="trash-outline" size={16} color={tokens.textMid} />
          <Text style={styles.trashToggleText}>Lixeira ({trashSessions.length})</Text>
          <Ionicons
            name={trashOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={tokens.textLow}
          />
        </Pressable>
        {trashOpen
          ? trashSessions.map((item) => (
              <TrashListRow key={item.id} item={item} trashSelection={trashSelection} />
            ))
          : null}
      </View>
    ) : null;

  const headerHidden = selection.active || trashSelection.active;

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
        <>
          <Text style={type.displayName}>Conversas</Text>
          <Text style={type.tagline}>Continue de onde parou</Text>
        </>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      {syncError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {sessions.length === 0 && trashSessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma conversa ainda</Text>
          <Text style={styles.emptyHint}>
            Pressione e segure uma conversa para selecionar — depois toque em outras para marcar várias.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            sessions.length === 0 ? (
              <Text style={styles.allInTrash}>Todas as conversas estão na lixeira.</Text>
            ) : null
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!selection.confirmingDelete}
          removeClippedSubviews={Platform.OS === 'android' && !selection.active}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  headerSpacer: { height: 8 },
  list: { paddingTop: 12, paddingBottom: 16 },
  rowWrap: { marginBottom: 8 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  errorText: { color: '#F87171', fontSize: 13, lineHeight: 18 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 80, gap: 8 },
  emptyTitle: { color: tokens.textHigh, fontSize: 17, fontWeight: '600' },
  emptyHint: { color: tokens.textMid, fontSize: 14, lineHeight: 20 },
  allInTrash: { color: tokens.textMid, fontSize: 14, marginBottom: 12 },
  trashSection: { marginBottom: 16 },
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
