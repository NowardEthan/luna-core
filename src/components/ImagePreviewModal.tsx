import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}

export function ImagePreviewModal({ visible, uri, title, onClose }: Props) {
  const { top, bottom } = useLayoutInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: top, paddingBottom: bottom }]}>
        <View style={styles.header}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <View style={styles.titleSpacer} />
          )}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeIconBtn}
            accessibilityLabel="Fechar pré-visualização"
          >
            <Ionicons name="close" size={26} color={tokens.textHigh} />
          </Pressable>
        </View>

        <View style={styles.imageStage}>
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={title}
            />
          ) : null}
        </View>

        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Fechar">
          <Text style={styles.closeLabel}>Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 22, 0.96)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  title: {
    flex: 1,
    fontSize: 13,
    color: tokens.textMid,
  },
  titleSpacer: {
    flex: 1,
  },
  closeIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.glassBorder,
    marginHorizontal: 12,
  },
  closeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.accentBright,
  },
});
