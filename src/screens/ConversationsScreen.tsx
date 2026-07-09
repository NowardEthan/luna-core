import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
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
import { ConversationFolderRow } from '../components/ConversationFolderRow';
import { ConversationDropZone } from '../components/ConversationDropZone';
import { ConversationDragDock } from '../components/ConversationDragDock';
import { ConversationDragGhost } from '../components/ConversationDragGhost';
import {
  ConversationFolderMenuSheet,
  type FolderSheetAction,
} from '../components/ConversationFolderMenuSheet';
import {
  ConversationOrganizeSheet,
  type OrganizeSheetAction,
} from '../components/ConversationOrganizeSheet';
import { ConversationMoveSheet } from '../components/ConversationMoveSheet';
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
import { useConversationDragDrop } from '../hooks/useConversationDragDrop';
import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import {
  buildExplorerBreadcrumb,
  buildExplorerView,
  parentFolderId,
  pinnedSessions,
} from '../lib/conversationOrganize/explorer';
import type { ConversationFolder } from '../lib/conversationOrganize/types';
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

type ListItem =
  | { kind: 'label'; text: string }
  | { kind: 'folder'; folder: ConversationFolder }
  | { kind: 'session'; session: SessionItem };

const SessionRow = memo(function SessionRow({
  session,
  selection,
  onOpenSession,
  onPrefetchSession,
  onMenuPress,
  dragEnabled,
  draggingId,
  createGripResponder,
}: {
  session: SessionItem;
  selection: ReturnType<typeof useConversationSelection>;
  onOpenSession: (id: string) => void;
  onPrefetchSession?: (id: string) => void;
  onMenuPress: (session: SessionItem) => void;
  dragEnabled?: boolean;
  draggingId?: string | null;
  createGripResponder?: (sessionId: string, title: string) => { panHandlers: object };
}) {
  const selected = selection.isSelected(session.id);
  const dragging = draggingId === session.id;

  const gripHandlers = useMemo(() => {
    if (!dragEnabled || !createGripResponder) return undefined;
    return createGripResponder(session.id, session.title).panHandlers;
  }, [createGripResponder, dragEnabled, session.id, session.title]);

  const handlePress = useCallback(() => {
    if (dragging) return;
    if (selection.active) {
      selection.toggle(session.id, session.title);
      return;
    }
    onOpenSession(session.id);
  }, [dragging, onOpenSession, selection, session.id, session.title]);

  const handleLongPress = useCallback(() => {
    if (dragging) return;
    if (selection.active) {
      selection.toggle(session.id, session.title);
      return;
    }
    selection.enter(session.id, session.title);
  }, [dragging, selection, session.id, session.title]);

  const prefetch = useCallback(() => {
    if (!selection.active && !dragging) onPrefetchSession?.(session.id);
  }, [dragging, onPrefetchSession, selection.active, session.id]);

  return (
    <View style={styles.rowWrap}>
      <ConversationRow
        session={session}
        selected={selected}
        selectionMode={selection.active}
        onPress={handlePress}
        onPressIn={prefetch}
        onLongPress={handleLongPress}
        onMenuPress={selection.active || dragging ? undefined : () => onMenuPress(session)}
        dragEnabled={dragEnabled}
        dragging={dragging}
        gripHandlers={gripHandlers}
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
  const [explorerFolderId, setExplorerFolderId] = useState<string | null>(null);
  const [organizeSession, setOrganizeSession] = useState<SessionItem | null>(null);
  const [folderMenuTarget, setFolderMenuTarget] = useState<ConversationFolder | null>(null);
  const [renameSessionTarget, setRenameSessionTarget] = useState<SessionItem | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<ConversationFolder | null>(null);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null | undefined>(
    undefined,
  );
  const [moveSessionTarget, setMoveSessionTarget] = useState<SessionItem | null>(null);

  const selection = useConversationSelection();
  const trashSelection = useTrashSelection();

  const organize = useConversationOrganize({
    uid,
    cloudEnabled,
    sessions,
    onRenameActiveTitle,
  });

  const dragEnabled = !selection.active && !trashSelection.active;

  const drag = useConversationDragDrop({
    enabled: dragEnabled,
    onMove: useCallback(
      (sessionId, collectionId) => {
        void organize.moveSession(sessionId, collectionId);
      },
      [organize],
    ),
    getCollectionId: useCallback(
      (sessionId) => organize.sessions.find((s) => s.id === sessionId)?.collectionId,
      [organize.sessions],
    ),
  });

  const sessionRowDragProps = useMemo(
    () => ({
      dragEnabled,
      draggingId: drag.draggingId,
      createGripResponder: drag.createGripResponder,
    }),
    [drag.createGripResponder, drag.draggingId, dragEnabled],
  );

  const breadcrumb = useMemo(
    () => buildExplorerBreadcrumb(explorerFolderId, organize.folders),
    [explorerFolderId, organize.folders],
  );

  const explorer = useMemo(
    () => buildExplorerView(explorerFolderId, organize.sessions, organize.folders),
    [explorerFolderId, organize.folders, organize.sessions],
  );

  const pinned = useMemo(
    () => (explorerFolderId === null ? pinnedSessions(organize.sessions) : []),
    [explorerFolderId, organize.sessions],
  );

  const chatsLabel =
    explorerFolderId === null
      ? ORGANIZE_COPY.explorerLooseChatsLabel
      : ORGANIZE_COPY.explorerChatsInFolderLabel;

  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    if (explorer.folders.length > 0) {
      items.push({ kind: 'label', text: ORGANIZE_COPY.explorerFoldersLabel });
      for (const folder of explorer.folders) {
        items.push({ kind: 'folder', folder });
      }
    }
    if (explorer.chats.length > 0) {
      items.push({ kind: 'label', text: chatsLabel });
      for (const session of explorer.chats) {
        items.push({ kind: 'session', session });
      }
    }
    return items;
  }, [chatsLabel, explorer.chats, explorer.folders]);

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
      if (action === 'move') {
        setMoveSessionTarget(session);
        return;
      }
      if (action === 'pin') {
        void organize.togglePin(session.id, true);
        return;
      }
      if (action === 'unpin') {
        void organize.togglePin(session.id, false);
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
    [onDeleteSession, organize, organizeSession, selection],
  );

  const handleFolderAction = useCallback(
    (action: FolderSheetAction) => {
      if (!folderMenuTarget) return;
      const folder = folderMenuTarget;
      setFolderMenuTarget(null);

      if (action === 'rename') {
        setRenameFolderTarget(folder);
        return;
      }
      if (action === 'subfolder') {
        setCreateFolderParentId(folder.id);
        return;
      }
      if (action === 'delete') {
        Alert.alert(
          ORGANIZE_COPY.folderDelete,
          ORGANIZE_COPY.folderDeleteConfirm.replace('{name}', folder.name),
          [
            { text: ORGANIZE_COPY.cancel, style: 'cancel' },
            {
              text: ORGANIZE_COPY.delete,
              style: 'destructive',
              onPress: () => {
                void organize.deleteFolder(folder.id);
                if (explorerFolderId === folder.id) {
                  setExplorerFolderId(parentFolderId(folder.id, organize.folders));
                }
              },
            },
          ],
        );
      }
    },
    [explorerFolderId, folderMenuTarget, organize],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'label') {
        return <Text style={styles.sectionLabel}>{item.text}</Text>;
      }
      if (item.kind === 'folder') {
        const target = { kind: 'folder' as const, folderId: item.folder.id };
        return (
          <ConversationDropZone
            zoneId={`folder-${item.folder.id}`}
            target={target}
            active={drag.isDropActive(target)}
            remeasureKey={drag.remeasureKey}
            onRegister={drag.registerZone}
            style={styles.dropZoneWrap}
          >
            <ConversationFolderRow
              folder={item.folder}
              folders={organize.folders}
              sessions={organize.sessions}
              onOpen={drag.isDragging ? () => {} : setExplorerFolderId}
              onMenu={drag.isDragging ? undefined : setFolderMenuTarget}
            />
          </ConversationDropZone>
        );
      }
      return (
        <SessionRow
          session={item.session}
          selection={selection}
          onOpenSession={onOpenSession}
          onPrefetchSession={onPrefetchSession}
          onMenuPress={setOrganizeSession}
          {...sessionRowDragProps}
        />
      );
    },
    [
      drag.isDragging,
      drag.isDropActive,
      drag.registerZone,
      drag.remeasureKey,
      onOpenSession,
      onPrefetchSession,
      organize.folders,
      organize.sessions,
      selection,
      sessionRowDragProps,
    ],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    if (item.kind === 'label') return `label-${item.text}`;
    if (item.kind === 'folder') return `folder-${item.folder.id}`;
    return item.session.id;
  }, []);

  const listHeader = explorerFolderId !== null ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.breadcrumb}
      scrollEnabled={!drag.isDragging}
    >
      {breadcrumb.map((seg, i) => {
        const target =
          seg.id == null
            ? ({ kind: 'root' } as const)
            : ({ kind: 'folder', folderId: seg.id } as const);
        const crumb = (
          <Pressable
            onPress={() => {
              if (!drag.isDragging) setExplorerFolderId(seg.id);
            }}
            style={({ pressed }) => [
              styles.crumb,
              pressed && !drag.isDragging && styles.crumbPressed,
              drag.isDragging && drag.isDropActive(target) && styles.crumbDropActive,
            ]}
          >
            <Text
              style={[styles.crumbText, seg.id === explorerFolderId && styles.crumbTextActive]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
          </Pressable>
        );

        return (
          <React.Fragment key={seg.id ?? 'root'}>
            {i > 0 ? <Ionicons name="chevron-forward" size={12} color={tokens.textLow} /> : null}
            {drag.isDragging ? (
              <ConversationDropZone
                zoneId={`crumb-${seg.id ?? 'root'}`}
                target={target}
                active={drag.isDropActive(target)}
                remeasureKey={drag.remeasureKey}
                onRegister={drag.registerZone}
              >
                {crumb}
              </ConversationDropZone>
            ) : (
              crumb
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  ) : null;

  const pinnedBlock =
    pinned.length > 0 ? (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{ORGANIZE_COPY.explorerPinnedLabel}</Text>
        {pinned.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            selection={selection}
            onOpenSession={onOpenSession}
            onPrefetchSession={onPrefetchSession}
            onMenuPress={setOrganizeSession}
            {...sessionRowDragProps}
          />
        ))}
      </View>
    ) : null;

  const listFooter =
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
  const isEmpty =
    organize.sessions.length === 0 &&
    organize.folders.length === 0 &&
    trashSessions.length === 0;

  return (
    <View style={[styles.container, { paddingTop: headerTopPad }]}>
      <ConversationDragDock
        visible={drag.isDragging}
        remeasureKey={drag.remeasureKey}
        rootActive={drag.isDropActive({ kind: 'root' })}
        onRegister={drag.registerZone}
      />
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
            <Text style={type.tagline}>
              {explorerFolderId === null
                ? dragEnabled
                  ? 'Arraste pelo ≡ para mover entre pastas'
                  : 'Continue de onde parou'
                : breadcrumb[breadcrumb.length - 1]?.label}
            </Text>
          </View>
          <View style={styles.topActions}>
            {explorerFolderId === null ? (
              <Pressable
                onPress={() => selection.arm()}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                accessibilityLabel="Selecionar conversas"
              >
                <Ionicons name="checkbox-outline" size={20} color={tokens.textMid} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() =>
                  setExplorerFolderId(parentFolderId(explorerFolderId, organize.folders))
                }
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                accessibilityLabel={ORGANIZE_COPY.explorerBack}
              >
                <Ionicons name="arrow-back" size={20} color={tokens.textMid} />
              </Pressable>
            )}
            <Pressable
              onPress={() => setCreateFolderParentId(explorerFolderId)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityLabel={ORGANIZE_COPY.explorerAddFolder}
            >
              <Ionicons name="folder-outline" size={20} color={tokens.accentBright} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      {syncError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma conversa ainda</Text>
          <Text style={styles.emptyHint}>
            Crie pastas para organizar ou toque em ⋯ numa conversa para renomear e mover.
          </Text>
        </View>
      ) : listData.length === 0 && pinned.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{ORGANIZE_COPY.explorerEmptyFolder}</Text>
          <Text style={styles.emptyHint}>{ORGANIZE_COPY.explorerEmptyFolderHint}</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={
            <>
              {listHeader}
              {pinnedBlock}
            </>
          }
          ListFooterComponent={listFooter}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!selection.confirmingDelete && !drag.isDragging}
          onScroll={drag.requestRemeasure}
          scrollEventThrottle={48}
          removeClippedSubviews={Platform.OS === 'android' && !selection.active}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      )}

      <ConversationOrganizeSheet
        visible={organizeSession != null}
        title={organizeSession?.title ?? ''}
        pinned={organizeSession?.pinned}
        onClose={() => setOrganizeSession(null)}
        onAction={handleOrganizeAction}
      />

      <ConversationFolderMenuSheet
        visible={folderMenuTarget != null}
        folder={folderMenuTarget}
        onClose={() => setFolderMenuTarget(null)}
        onAction={handleFolderAction}
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

      <ConversationNameSheet
        visible={renameFolderTarget != null}
        title={ORGANIZE_COPY.renameFolderTitle}
        initialValue={renameFolderTarget?.name ?? ''}
        placeholder={ORGANIZE_COPY.folderNamePlaceholder}
        onClose={() => setRenameFolderTarget(null)}
        onSave={(name) => {
          if (!renameFolderTarget) return;
          void organize.renameFolder(renameFolderTarget.id, name);
          setRenameFolderTarget(null);
        }}
      />

      <ConversationNameSheet
        visible={createFolderParentId !== undefined}
        title={
          createFolderParentId
            ? ORGANIZE_COPY.explorerAddSubfolder
            : ORGANIZE_COPY.createFolderTitle
        }
        initialValue=""
        placeholder={ORGANIZE_COPY.folderNamePlaceholder}
        onClose={() => setCreateFolderParentId(undefined)}
        onSave={(name) => {
          const parentId = createFolderParentId ?? null;
          void organize.createFolder(name, parentId);
          setCreateFolderParentId(undefined);
        }}
      />

      <ConversationMoveSheet
        visible={moveSessionTarget != null}
        folders={organize.folders}
        currentCollectionId={moveSessionTarget?.collectionId}
        onClose={() => setMoveSessionTarget(null)}
        onSelect={(collectionId) => {
          if (!moveSessionTarget) return;
          void organize.moveSession(moveSessionTarget.id, collectionId);
          setMoveSessionTarget(null);
        }}
      />

      <ConversationDragGhost ghost={drag.ghost} />
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
  topActions: { flexDirection: 'row', gap: 4, paddingTop: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconBtnPressed: { opacity: 0.85 },
  headerSpacer: { height: 8 },
  list: { paddingTop: 12, paddingBottom: 16 },
  rowWrap: { marginBottom: 8 },
  dropZoneWrap: { marginBottom: 8, borderRadius: 16 },
  section: { marginBottom: 8 },
  sectionLabel: {
    color: tokens.textLow,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionLabelSpaced: { marginTop: 4 },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    paddingVertical: 4,
  },
  crumb: { maxWidth: 140 },
  crumbPressed: { opacity: 0.85 },
  crumbText: { color: tokens.textMid, fontSize: 13, fontWeight: '600' },
  crumbTextActive: { color: tokens.accentBright },
  crumbDropActive: {
    backgroundColor: 'rgba(75,117,242,0.2)',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
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
