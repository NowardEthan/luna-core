import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LunaAvatar } from './LunaAvatar';
import { tokens } from '../theme/tokens';

interface Props {
  firstInGroup: boolean;
  richText?: boolean;
  /** Menos padding — voz, typing, etc. */
  compact?: boolean;
  /** Estado "pensando" — borda accent suave. */
  thinking?: boolean;
  children: React.ReactNode;
}

/** Cartão da Luna — avatar + nome dentro da bolha, conteúdo abaixo. */
export function LunaBubbleShell({ firstInGroup, richText, compact, thinking, children }: Props) {
  return (
    <View
      style={[
        styles.shell,
        firstInGroup ? styles.shellLead : styles.shellGrouped,
        richText && styles.shellRich,
        thinking && styles.shellThinking,
      ]}
    >
      {firstInGroup ? (
        <>
          <View style={styles.header}>
            <LunaAvatar size={26} />
            <Text style={styles.name}>Luna</Text>
          </View>
          <View style={styles.headerRule} />
        </>
      ) : null}
      <View style={[styles.body, richText && styles.bodyRich, compact && styles.bodyCompact]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    backgroundColor: tokens.bubbleLuna,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shellLead: {
    borderRadius: 18,
    borderTopLeftRadius: 8,
  },
  shellGrouped: {
    borderRadius: 18,
    marginTop: 2,
  },
  shellRich: {
    borderColor: 'rgba(75, 117, 242, 0.14)',
  },
  shellThinking: {
    borderColor: 'rgba(75, 117, 242, 0.32)',
    shadowColor: tokens.accent,
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'rgba(75, 117, 242, 0.06)',
  },
  name: {
    color: tokens.accentText,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.25,
  },
  headerRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.glassBorder,
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bodyRich: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  bodyCompact: {
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
});
