import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ORGANIZE_COPY } from '../lib/conversationOrganize/copy';
import { buildFolderTree, flattenFoldersForSelect } from '../lib/conversationOrganize/folderTree';
import type { ConversationFolder } from '../lib/conversationOrganize/types';
import { useMotionProfile } from '../hooks/useMotionProfile';
import { hapticListTap } from '../lib/haptics';
import { springs } from '../lib/motionTokens';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  folders: ConversationFolder[];
  currentCollectionId?: string | null;
  onClose: () => void;
  onSelect: (collectionId: string | null) => void;
}

export function ConversationMoveSheet({
  visible,
  folders,
  currentCollectionId,
  onClose,
  onSelect,
}: Props) {
  const { interactions, reduceMotion } = useMotionProfile();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(360)).current;

  const options = useMemo(() => {
    const tree = buildFolderTree(folders);
    return flattenFoldersForSelect(tree);
  }, [folders]);

  useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      sheetY.setValue(360);
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
      Animated.timing(sheetY, { toValue: 360, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
          <View style={styles.sheet}>
          <Text style={styles.title}>{ORGANIZE_COPY.moveTitle}</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => {
                hapticListTap();
                handleClose();
                onSelect(null);
              }}
              style={({ pressed }) => [
                styles.row,
                currentCollectionId == null && styles.rowActive,
                pressed && styles.rowPressed,
              ]}
            >
              <Ionicons name="albums-outline" size={18} color={tokens.textMid} />
              <Text style={styles.rowLabel}>{ORGANIZE_COPY.noCollection}</Text>
              {currentCollectionId == null ? (
                <Ionicons name="checkmark" size={18} color={tokens.accentBright} />
              ) : null}
            </Pressable>
            {options.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => {
                  hapticListTap();
                  handleClose();
                  onSelect(opt.id);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { paddingLeft: 14 + opt.depth * 16 },
                  currentCollectionId === opt.id && styles.rowActive,
                  pressed && styles.rowPressed,
                ]}
              >
                <Ionicons name="folder-outline" size={18} color={tokens.accentBright} />
                <Text style={styles.rowLabel}>{opt.label}</Text>
                {currentCollectionId === opt.id ? (
                  <Ionicons name="checkmark" size={18} color={tokens.accentBright} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
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
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 16,
    maxHeight: '70%',
    backgroundColor: '#1A1E28',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  title: {
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  rowActive: { backgroundColor: 'rgba(75,117,242,0.14)' },
  rowPressed: { opacity: 0.88 },
  rowLabel: { flex: 1, color: tokens.textHigh, fontSize: 15, fontWeight: '500' },
});
