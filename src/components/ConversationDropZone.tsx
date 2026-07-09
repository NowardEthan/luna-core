import React, { memo, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { ConversationDropTarget, DropZoneRect } from '../lib/conversationOrganize/conversationDragDrop';
import { tokens } from '../theme/tokens';

interface Props {
  zoneId: string;
  target: ConversationDropTarget;
  active?: boolean;
  remeasureKey?: number;
  style?: ViewStyle;
  onRegister: (zoneId: string, target: ConversationDropTarget, rect: DropZoneRect | null) => void;
  children: React.ReactNode;
}

export const ConversationDropZone = memo(function ConversationDropZone({
  zoneId,
  target,
  active = false,
  remeasureKey = 0,
  style,
  onRegister,
  children,
}: Props) {
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) {
        onRegister(zoneId, target, null);
        return;
      }
      onRegister(zoneId, target, { x, y, width, height });
    });
  }, [onRegister, target, zoneId]);

  useEffect(() => {
    measure();
    return () => onRegister(zoneId, target, null);
  }, [measure, onRegister, remeasureKey, target, zoneId]);

  return (
    <View
      ref={ref}
      onLayout={measure}
      style={[style, active && styles.active]}
      collapsable={false}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  active: {
    borderColor: tokens.accentBright,
    backgroundColor: 'rgba(75,117,242,0.2)',
    shadowColor: tokens.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
