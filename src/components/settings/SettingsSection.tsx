import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';

interface Props {
  title: string;
  footer?: string;
  children: ReactNode;
}

/** Grupo de definições com título de secção. */
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
  wrap: { marginTop: 22 },
  title: {
    color: tokens.textMid,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  footer: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    marginHorizontal: 4,
  },
});
