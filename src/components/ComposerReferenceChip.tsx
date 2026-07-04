import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThreadReference } from '../lib/messageReference';
import { isDocumentReference, referenceChipLabel } from '../lib/messageReference';
import { tokens } from '../theme/tokens';

interface Props {
  reference: ThreadReference;
  onClear: () => void;
}

/** Trecho referenciado anexado ao composer — visível antes de enviar. */
export const ComposerReferenceChip = memo(function ComposerReferenceChip({
  reference,
  onClear,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.chip}>
        <Ionicons
          name={isDocumentReference(reference) ? 'document-text-outline' : 'chatbox-ellipses-outline'}
          size={14}
          color={
            isDocumentReference(reference)
              ? 'rgba(255, 193, 120, 0.95)'
              : reference.role === 'user'
                ? tokens.bubbleUserStart
                : tokens.accentBright
          }
        />
        <Text style={styles.label} numberOfLines={2}>
          {referenceChipLabel(reference)}
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityLabel="Remover referência"
          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={16} color={tokens.textMid} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(99, 140, 255, 0.3)',
    backgroundColor: 'rgba(99, 140, 255, 0.1)',
  },
  label: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 12,
    lineHeight: 16,
  },
  clearBtn: { padding: 2 },
  pressed: { opacity: 0.75 },
});
