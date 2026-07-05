import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './Glass';
import { LUNA_HOME_FEATURES } from '../data/lunaFeatures';
import { tokens } from '../theme/tokens';

/** Grid 2×N — destaca ferramentas reais da Luna (informativo, sem prompt automático). */
export const HomeFeatureGrid = memo(function HomeFeatureGrid() {
  return (
    <View style={styles.grid}>
      {LUNA_HOME_FEATURES.map((feature) => (
        <Glass key={feature.id} radius={14} style={styles.card}>
          <View style={[styles.iconBox, { backgroundColor: `${feature.accent}22` }]}>
            <Ionicons name={feature.icon} size={18} color={feature.accent} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {feature.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {feature.subtitle}
          </Text>
        </Glass>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    padding: 12,
    gap: 6,
    minHeight: 96,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: tokens.textHigh,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: tokens.textMid,
    fontSize: 11.5,
    lineHeight: 15,
  },
});
