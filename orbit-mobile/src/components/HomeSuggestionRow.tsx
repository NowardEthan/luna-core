import React, { memo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './Glass';
import { usePressSpring } from '../hooks/usePressSpring';
import { tokens } from '../theme/tokens';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  sparkles: 'sparkles',
  calendar: 'calendar-outline',
  'help-circle': 'help-circle-outline',
  list: 'list-outline',
  code: 'code-slash-outline',
  mic: 'mic-outline',
};

interface Props {
  title: string;
  subtitle?: string;
  icon: string;
  accent?: string;
  onPress: () => void;
}

/** Linha de sugestão na home — legível, toque confortável, ícone com cor temática. */
export const HomeSuggestionRow = memo(function HomeSuggestionRow({
  title,
  subtitle,
  icon,
  accent = tokens.accent,
  onPress,
}: Props) {
  const { scale, onPressIn, onPressOut, enabled } = usePressSpring();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [!enabled && pressed && styles.pressedLite]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Glass radius={16} style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: `${accent}22`, borderColor: `${accent}44` }]}>
            <Ionicons name={iconMap[icon] ?? 'sparkles'} size={18} color={accent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={tokens.textLow} />
        </Glass>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  copy: { flex: 1, gap: 2 },
  title: {
    color: tokens.textHigh,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: tokens.textMid,
    fontSize: 12.5,
    lineHeight: 17,
  },
  pressedLite: { opacity: 0.85 },
});
