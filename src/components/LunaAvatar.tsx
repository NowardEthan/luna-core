import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { tokens } from '../theme/tokens';

const lunaAvatar = require('../../assets/luna-avatar.png');

interface Props {
  size?: number;
  /** Zoom leve no rosto — igual ao desktop. */
  zoom?: number;
}

export const LunaAvatar = memo(function LunaAvatar({ size = 30, zoom = 1.14 }: Props) {
  const radius = size / 2;
  const imgSize = size * zoom;

  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }]}>
      <Image
        source={lunaAvatar}
        style={{
          width: imgSize,
          height: imgSize,
          marginTop: -(imgSize - size) * 0.35,
          marginLeft: -(imgSize - size) * 0.5,
        }}
        contentFit="cover"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(75, 117, 242, 0.42)',
    backgroundColor: tokens.surface,
  },
});
