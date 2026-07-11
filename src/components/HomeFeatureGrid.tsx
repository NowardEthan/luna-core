import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LUNA_HOME_FEATURES } from '../data/lunaFeatures';
import { tokens } from '../theme/tokens';

/** Grade compacta de capacidades reais da Luna. */
export const HomeFeatureGrid = memo(function HomeFeatureGrid() {
  return (
    <View style={styles.grid}>
      {LUNA_HOME_FEATURES.map((feature) => (
        <View key={feature.id} style={styles.card}>
          <View style={[styles.iconBox, { backgroundColor: `${feature.accent}1F` }]}>
            <Ionicons name={feature.icon} size={18} color={feature.accent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {feature.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {feature.subtitle}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 104,
    padding: 12,
    borderRadius: 8,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  copy: { gap: 3 },
  title: {
    color: tokens.textHigh,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: tokens.textMid,
    fontSize: 11.5,
    lineHeight: 15,
  },
});
