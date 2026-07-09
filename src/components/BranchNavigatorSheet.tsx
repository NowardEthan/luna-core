import React, { memo, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ChatMessage } from '../data/fixtures';
import type { ActiveTimeline, ArchivedBranch, ForkSource } from '../lib/branchState';
import {
  branchPreviewText,
  inactiveTimelineLabel,
  timelineLabel,
} from '../lib/branchState';
import type { ForkLink } from '../lib/branchStorage';
import { hapticConfirm, hapticDestructive, hapticLongPress } from '../lib/haptics';
import { tokens } from '../theme/tokens';

export type BranchNavigatorSelection =
  | { type: 'timeline'; timeline: ActiveTimeline }
  | { type: 'fork-child'; sessionId: string; title: string };

export type BranchNavigatorAction =
  | { type: 'switch-timeline'; timeline: ActiveTimeline }
  | { type: 'scroll-to'; target: 'split' | 'inactive-block' }
  | { type: 'open-session'; sessionId: string }
  | { type: 'expand-inactive' }
  | { type: 'delete-timeline'; timeline: ActiveTimeline }
  | { type: 'delete-fork'; childSessionId: string; childTitle?: string };

interface Props {
  visible: boolean;
  branchPoint: number | null;
  activeTimeline: ActiveTimeline;
  activeTailCount: number;
  activeTailMessages: ChatMessage[];
  archivedBranch: ArchivedBranch | null;
  forkSource: ForkSource | null;
  childForks: ForkLink[];
  onAction: (action: BranchNavigatorAction) => void;
  onClose: () => void;
}

function TimelineRow({
  title,
  subtitle,
  preview,
  count,
  active,
  selected,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  preview: string;
  count: number;
  active: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        selected && styles.rowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowIcon}>
          <Ionicons
            name={selected ? 'checkmark-circle' : active ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={selected ? tokens.accentBright : active ? tokens.accentBright : tokens.textLow}
          />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowTitle}>{title}</Text>
            {active ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Ativo</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSub}>
            {count} {count === 1 ? 'mensagem' : 'mensagens'} · {subtitle}
          </Text>
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ForkRow({
  label,
  title,
  selected,
  onPress,
  onLongPress,
  icon,
}: {
  label: string;
  title: string;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: 'arrow-undo-outline' | 'git-branch-outline';
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.forkRow,
        selected && styles.rowSelected,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={selected ? 'checkmark-circle' : icon}
        size={20}
        color={selected ? tokens.accentBright : icon === 'git-branch-outline' ? tokens.accentBright : tokens.textMid}
      />
      <View style={styles.forkBody}>
        <Text style={styles.forkLabel}>{label}</Text>
        <Text style={styles.forkTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

export const BranchNavigatorSheet = memo(function BranchNavigatorSheet({
  visible,
  branchPoint,
  activeTimeline,
  activeTailCount,
  activeTailMessages,
  archivedBranch,
  forkSource,
  childForks,
  onAction,
  onClose,
}: Props) {
  const [selection, setSelection] = useState<BranchNavigatorSelection | null>(null);

  useEffect(() => {
    if (!visible) setSelection(null);
  }, [visible]);

  const hasInternalBranch = branchPoint != null && archivedBranch != null;
  const inactiveCount = archivedBranch?.messages.length ?? 0;
  const inactiveTimeline: ActiveTimeline =
    activeTimeline === 'continuation' ? 'archived' : 'continuation';

  const selectTimeline = (timeline: ActiveTimeline) => {
    hapticLongPress();
    setSelection({ type: 'timeline', timeline });
  };

  const selectForkChild = (sessionId: string, title: string) => {
    hapticLongPress();
    setSelection({ type: 'fork-child', sessionId, title });
  };

  const isTimelineSelected = (timeline: ActiveTimeline) =>
    selection?.type === 'timeline' && selection.timeline === timeline;

  const isForkChildSelected = (sessionId: string) =>
    selection?.type === 'fork-child' && selection.sessionId === sessionId;

  const renderSelectionActions = () => {
    if (!selection) {
      return (
        <Text style={styles.selectHint}>Toque num item para selecionar e excluir ou abrir.</Text>
      );
    }

    if (selection.type === 'timeline') {
      const isActive = selection.timeline === activeTimeline;
      return (
        <View style={styles.actionBar}>
          <Text style={styles.actionLabel} numberOfLines={1}>
            {timelineLabel(selection.timeline)}
            {isActive ? ' · ramo ativo' : ''}
          </Text>
          <View style={styles.actionRow}>
            {!isActive ? (
              <Pressable
                onPress={() => {
                  hapticConfirm();
                  onAction({ type: 'switch-timeline', timeline: selection.timeline });
                }}
                style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.actionPrimaryText}>Usar este ramo</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => onAction({ type: 'scroll-to', target: 'split' })}
                style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.actionPrimaryText}>Ir ao ponto</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                hapticDestructive();
                onAction({ type: 'delete-timeline', timeline: selection.timeline });
              }}
              style={({ pressed }) => [styles.actionBtn, styles.actionDanger, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={16} color="#ffb4b4" />
              <Text style={styles.actionDangerText}>Excluir ramo</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.actionBar}>
        <Text style={styles.actionLabel} numberOfLines={1}>
          {selection.title}
        </Text>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              hapticConfirm();
              onAction({ type: 'open-session', sessionId: selection.sessionId });
            }}
            style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}
          >
            <Text style={styles.actionPrimaryText}>Abrir</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticDestructive();
              onAction({
                type: 'delete-fork',
                childSessionId: selection.sessionId,
                childTitle: selection.title,
              });
            }}
            style={({ pressed }) => [styles.actionBtn, styles.actionDanger, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={16} color="#ffb4b4" />
            <Text style={styles.actionDangerText}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.eyebrow}>Ramificações</Text>
            <Text style={styles.title}>Selecione um ramo ou bifurcação</Text>

            <ScrollView style={styles.scroll} bounces={false}>
              {hasInternalBranch ? (
                <>
                  <Text style={styles.section}>Nesta conversa</Text>
                  <Text style={styles.sectionHint}>
                    Bifurcação após a mensagem #{branchPoint}. Toque para selecionar.
                  </Text>

                  <TimelineRow
                    title={timelineLabel(activeTimeline)}
                    subtitle="continuação atual"
                    preview={branchPreviewText(activeTailMessages)}
                    count={activeTailCount}
                    active
                    selected={isTimelineSelected(activeTimeline)}
                    onPress={() => selectTimeline(activeTimeline)}
                    onLongPress={() => selectTimeline(activeTimeline)}
                  />

                  {inactiveCount > 0 ? (
                    <TimelineRow
                      title={inactiveTimelineLabel(activeTimeline)}
                      subtitle="arquivado"
                      preview={branchPreviewText(archivedBranch!.messages)}
                      count={inactiveCount}
                      active={false}
                      selected={isTimelineSelected(inactiveTimeline)}
                      onPress={() => selectTimeline(inactiveTimeline)}
                      onLongPress={() => selectTimeline(inactiveTimeline)}
                    />
                  ) : null}
                </>
              ) : null}

              {(forkSource || childForks.length > 0) && (
                <>
                  <Text style={[styles.section, hasInternalBranch && styles.sectionSpaced]}>
                    Conversas bifurcadas
                  </Text>
                  {forkSource ? (
                    <ForkRow
                      label="Conversa original"
                      title={forkSource.title}
                      selected={false}
                      icon="arrow-undo-outline"
                      onPress={() => onAction({ type: 'open-session', sessionId: forkSource.sessionId })}
                      onLongPress={() => onAction({ type: 'open-session', sessionId: forkSource.sessionId })}
                    />
                  ) : null}
                  {childForks.map((fork) => (
                    <ForkRow
                      key={fork.childSessionId}
                      label="Bifurcação"
                      title={fork.childTitle}
                      selected={isForkChildSelected(fork.childSessionId)}
                      icon="git-branch-outline"
                      onPress={() => selectForkChild(fork.childSessionId, fork.childTitle)}
                      onLongPress={() => selectForkChild(fork.childSessionId, fork.childTitle)}
                    />
                  ))}
                </>
              )}
            </ScrollView>

            {renderSelectionActions()}

            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>Fechar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 12, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetWrap: { width: '100%' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 10,
    maxHeight: '85%',
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 12,
  },
  eyebrow: {
    color: tokens.textLow,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  scroll: { maxHeight: 360 },
  section: {
    color: tokens.textMid,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  sectionSpaced: { marginTop: 16 },
  sectionHint: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  row: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowActive: {
    borderColor: 'rgba(99, 140, 255, 0.35)',
    backgroundColor: 'rgba(99, 140, 255, 0.08)',
  },
  rowSelected: {
    borderColor: 'rgba(99, 140, 255, 0.65)',
    backgroundColor: 'rgba(99, 140, 255, 0.14)',
  },
  rowMain: { flexDirection: 'row', padding: 12, gap: 10 },
  rowIcon: { paddingTop: 2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 140, 255, 0.25)',
  },
  badgeText: { color: tokens.accentBright, fontSize: 10, fontWeight: '700' },
  rowSub: { color: tokens.textMid, fontSize: 12, marginTop: 3 },
  preview: {
    color: tokens.textLow,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 17,
  },
  forkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  forkBody: { flex: 1, minWidth: 0 },
  forkLabel: {
    color: tokens.textLow,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  forkTitle: { color: tokens.textHigh, fontSize: 14, fontWeight: '500', marginTop: 2 },
  selectHint: {
    color: tokens.textLow,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  actionBar: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(99, 140, 255, 0.25)',
    backgroundColor: 'rgba(99, 140, 255, 0.06)',
  },
  actionLabel: {
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  actionPrimary: {
    backgroundColor: tokens.accent,
  },
  actionPrimaryText: { color: tokens.onAccent, fontSize: 14, fontWeight: '600' },
  actionDanger: {
    backgroundColor: 'rgba(255, 80, 80, 0.12)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 120, 120, 0.35)',
  },
  actionDangerText: { color: '#ffb4b4', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  close: { alignItems: 'center', paddingTop: 14 },
  closeText: { color: tokens.textMid, fontSize: 15 },
});
