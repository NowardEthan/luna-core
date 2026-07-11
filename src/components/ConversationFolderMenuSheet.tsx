import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import type { ConversationFolder } from '../lib/conversationOrganize/types';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticDestructive, hapticListTap } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

export type FolderSheetAction = 'rename' | 'subfolder' | 'delete';

interface Props {
  visible: boolean;
  folder: ConversationFolder | null;
  onClose: () => void;
  onAction: (action: FolderSheetAction) => void;
}

export function ConversationFolderMenuSheet({ visible, folder, onClose, onAction }: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(240)).current;

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(240);
      return;
    }
    if (!interactions || reduceMotion) {
      backdrop.setValue(1);
      sheetY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, ...springs.tab, useNativeDriver: true }),
    ]).start();
  }, [backdrop, interactions, reduceMotion, sheetY, visible]);

  const handleClose = () => {
    if (!interactions || reduceMotion) {
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 240, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible || !folder) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
          <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={1}>
            {folder.name}
          </Text>
          <Pressable
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction('rename');
            }}
            style={styles.row}
          >
            <Ionicons name="pencil-outline" size={20} color={tokens.accentBright} />
            <Text style={styles.rowLabel}>{ORGANIZE_COPY.folderRename}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticListTap();
              handleClose();
              onAction('subfolder');
            }}
            style={styles.row}
          >
            <Ionicons name="folder-open-outline" size={20} color={tokens.accentBright} />
            <Text style={styles.rowLabel}>{ORGANIZE_COPY.explorerAddSubfolder}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticDestructive();
              handleClose();
              onAction('delete');
            }}
            style={styles.row}
          >
            <Ionicons name="trash-outline" size={20} color="#F87171" />
            <Text style={[styles.rowLabel, styles.danger]}>{ORGANIZE_COPY.folderDelete}</Text>
          </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 16,
    backgroundColor: '#1A1E28',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  title: { color: tokens.textHigh, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLabel: { color: tokens.textHigh, fontSize: 16, fontWeight: '500' },
  danger: { color: tokens.error },
});
