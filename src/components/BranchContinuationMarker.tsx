import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';

/** Separador visual entre ramo arquivado e continuação alternativa. */
export const BranchContinuationMarker = memo(function BranchContinuationMarker() {
  return (
    <View style={styles.root} accessibilityLabel="Continuação alternativa">
      <View style={styles.line} />
      <Text style={styles.label}>↳ Ramo alternativo</Text>
      <View style={styles.line} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(99, 140, 255, 0.35)',
  },
  label: {
    color: tokens.textMid,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
