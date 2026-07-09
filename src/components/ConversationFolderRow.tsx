import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ConversationFolder } from '../lib/conversationOrganize/types';
import { folderRowMeta } from '../lib/conversationOrganize/explorer';
import type { SessionItem } from '../data/fixtures';
import { hapticListTap } from '../lib/haptics';
import { tokens } from '../theme/tokens';

interface Props {
  folder: ConversationFolder;
  folders: ConversationFolder[];
  sessions: SessionItem[];
  onOpen: (folderId: string) => void;
  onMenu?: (folder: ConversationFolder) => void;
}

export const ConversationFolderRow = memo(function ConversationFolderRow({
  folder,
  folders,
  sessions,
  onOpen,
  onMenu,
}: Props) {
  const meta = folderRowMeta(folder, folders, sessions);

  return (
    <Pressable
      onPress={() => {
        hapticListTap();
        onOpen(folder.id);
      }}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Abrir pasta ${folder.name}`}
    >
      <View style={styles.iconChip}>
        <Ionicons name="folder-outline" size={18} color={tokens.accentBright} />
      </View>
      <View style={styles.col}>
        <Text style={styles.name} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onMenu ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onMenu(folder);
          }}
          hitSlop={10}
          style={styles.menuBtn}
          accessibilityRole="button"
          accessibilityLabel={`Opções da pasta ${folder.name}`}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={tokens.textMid} />
        </Pressable>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={tokens.textLow} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.055)',
    gap: 4,
  },
  pressed: { opacity: 0.9 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
  },
  col: { flex: 1, paddingHorizontal: 8, gap: 2, minWidth: 0 },
  name: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  meta: { color: tokens.textMid, fontSize: 12 },
  menuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
