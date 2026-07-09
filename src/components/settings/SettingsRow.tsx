import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  detail?: string;
  value?: string;
  showChevron?: boolean;
  destructive?: boolean;
  loading?: boolean;
  last?: boolean;
  onPress?: () => void;
  /** Exibe um Switch no lado direito. */
  toggle?: boolean;
  /** Estado do switch. */
  toggled?: boolean;
  /** Chamado quando o switch muda. */
  onToggle?: (value: boolean) => void;
}

/** Linha de definição — toque opcional. */
export function SettingsRow({
  icon,
  iconColor = tokens.accentBright,
  label,
  detail,
  value,
  showChevron,
  destructive,
  loading,
  last,
  onPress,
  toggle,
  toggled,
  onToggle,
}: Props) {
  const content = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={tokens.textMid} size="small" />
      ) : value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {toggle ? (
        <Switch
          value={toggled}
          onValueChange={onToggle}
          trackColor={{ false: tokens.surfaceRaised, true: `${tokens.accentBright}80` }}
          thumbColor={toggled ? tokens.accentBright : tokens.textLow}
        />
      ) : null}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={tokens.textLow} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, !last && styles.border]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 52,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.glassBorder,
  },
  pressed: { opacity: 0.88 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 2 },
  label: { color: tokens.textHigh, fontSize: 15, fontWeight: '500' },
  detail: { color: tokens.textMid, fontSize: 12, lineHeight: 16 },
  value: {
    color: tokens.textMid,
    fontSize: 13,
    maxWidth: 120,
    textAlign: 'right',
  },
  destructive: { color: '#E57373' },
});
