import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ConversationDropZone } from './ConversationDropZone';
import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import type { ConversationDropTarget } from '../lib/conversationOrganize/conversationDragDrop';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  remeasureKey: number;
  rootActive: boolean;
  onRegister: (zoneId: string, target: ConversationDropTarget, rect: import('../lib/conversationOrganize/conversationDragDrop').DropZoneRect | null) => void;
}

/** Barra fixa no topo enquanto arrasta — soltar fora de pastas. */
export const ConversationDragDock = memo(function ConversationDragDock({
  visible,
  remeasureKey,
  rootActive,
  onRegister,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ConversationDropZone
        zoneId="drag-dock-root"
        target={{ kind: 'root' }}
        active={rootActive}
        remeasureKey={remeasureKey}
        onRegister={onRegister}
        style={styles.pill}
      >
        <Ionicons name="albums-outline" size={18} color={tokens.accentBright} />
        <Text style={styles.label}>{ORGANIZE_COPY.noCollection}</Text>
        <Text style={styles.hint}>{ORGANIZE_COPY.dragDropHint}</Text>
      </ConversationDropZone>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 22,
    right: 22,
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(26,30,40,0.92)',
  },
  label: {
    color: tokens.textHigh,
    fontSize: 14,
    fontWeight: '700',
  },
  hint: {
    flex: 1,
    color: tokens.textMid,
    fontSize: 12,
    textAlign: 'right',
  },
});
