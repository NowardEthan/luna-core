import React, { memo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './Glass';
import { usePressSpring } from '../hooks/usePressSpring';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  sparkles: 'sparkles',
  calendar: 'calendar-outline',
  'help-circle': 'help-circle-outline',
  list: 'list-outline',
};

interface Props {
  text: string;
  icon: string;
  onPress: () => void;
}

export const SuggestionCard = memo(function SuggestionCard({ text, icon, onPress }: Props) {
  const { scale, onPressIn, onPressOut, enabled } = usePressSpring();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [!enabled && pressed && styles.pressedLite]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Glass radius={20} style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name={iconMap[icon] ?? 'sparkles'} size={20} color={tokens.accentBright} />
          </View>
          <Text style={styles.text} numberOfLines={3}>
            {text}
          </Text>
        </Glass>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 164,
    height: 128,
    padding: 14,
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    backgroundColor: 'rgba(75,117,242,0.12)',
  },
  text: {
    ...type.message,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    color: tokens.textHigh,
  },
  pressedLite: { opacity: 0.82 },
});
