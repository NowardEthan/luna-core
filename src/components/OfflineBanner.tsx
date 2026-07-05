import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';

interface Props {
  deviceOffline: boolean;
  apiReachable: boolean;
  onRetry?: () => void;
}

/** Aviso global quando o dispositivo ou a Luna API estão indisponíveis. */
export const OfflineBanner = memo(function OfflineBanner({
  deviceOffline,
  apiReachable,
  onRetry,
}: Props) {
  const insets = useSafeAreaInsets();

  const visible = deviceOffline || !apiReachable;
  if (!visible) return null;

  const message = deviceOffline
    ? 'Sem conexão com a internet'
    : 'Luna API indisponível — mensagens podem falhar';

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.banner}>
        <Ionicons name="cloud-offline-outline" size={18} color="#FFB4AB" />
        <Text style={styles.text}>{message}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Tentar reconectar"
          >
            <Text style={styles.retry}>Tentar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 14,
    pointerEvents: 'box-none',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(180, 60, 60, 0.92)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: {
    flex: 1,
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
  },
  retry: {
    color: '#FFDAD4',
    fontSize: 13,
    fontWeight: '700',
  },
});
