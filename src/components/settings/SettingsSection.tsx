import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';

interface Props {
  title: string;
  footer?: string;
  children: ReactNode;
}

/** Grupo de definições com superfície sólida do Orbit mobile. */
export function SettingsSection({ title, footer, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  title: {
    color: tokens.textLow,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  group: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
  },
  footer: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
});
