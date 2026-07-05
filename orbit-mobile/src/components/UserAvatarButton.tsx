import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';

interface Props {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Avatar do utilizador — mesma fonte visual do ecrã Perfil; toque abre o perfil. */
export const UserAvatarButton = memo(function UserAvatarButton({
  initials,
  avatarUrl,
  size = 40,
  onPress,
  accessibilityLabel = 'Abrir perfil',
}: Props) {
  const radius = size / 2;

  const avatar = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: radius }} />
  ) : (
    <LinearGradient
      colors={[tokens.accentBright, tokens.accentDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </LinearGradient>
  );

  if (!onPress) {
    return (
      <View style={[styles.ring, { width: size + 4, height: size + 4, borderRadius: radius + 2 }]}>
        {avatar}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.ring, { width: size + 4, height: size + 4, borderRadius: radius + 2 }, pressed && styles.pressed]}
    >
      {avatar}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  initials: {
    color: tokens.onAccent,
    fontWeight: '700',
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
