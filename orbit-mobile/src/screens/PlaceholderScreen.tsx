import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function PlaceholderScreen({ title, subtitle, icon }: Props) {
  const headerTopPad = useHeaderTopPadding(10);

  return (
    <View style={[styles.container, { paddingTop: headerTopPad }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={tokens.accentBright} />
      </View>
      <Text style={type.displayName}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Em breve no Orbit mobile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 22,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: tokens.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sub: {
    ...type.tagline,
    marginTop: 8,
    maxWidth: 280,
  },
  badge: {
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  badgeText: {
    color: tokens.textMid,
    fontSize: 13,
    fontWeight: '500',
  },
});
