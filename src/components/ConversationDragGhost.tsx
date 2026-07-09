import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { DragGhost } from '../lib/conversationOrganize/conversationDragDrop';
import { tokens } from '../theme/tokens';

export const ConversationDragGhost = memo(function ConversationDragGhost({
  ghost,
}: {
  ghost: DragGhost | null;
}) {
  if (!ghost) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.ghost,
        {
          left: ghost.x - 120,
          top: ghost.y - 28,
        },
      ]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={16} color={tokens.accentBright} />
      <Text style={styles.title} numberOfLines={1}>
        {ghost.title}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    zIndex: 9999,
    width: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.accent,
    backgroundColor: 'rgba(26,30,40,0.94)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  title: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 14,
    fontWeight: '600',
  },
});
