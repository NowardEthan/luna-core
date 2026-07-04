import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';

export type AttachSheetTab = 'photos' | 'files';

type TabDef = {
  id: AttachSheetTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDef[] = [
  { id: 'photos', label: 'Galeria', icon: 'images-outline', iconActive: 'images' },
  { id: 'files', label: 'Arquivo', icon: 'document-outline', iconActive: 'document' },
];

interface Props {
  active: AttachSheetTab;
  onChange: (tab: AttachSheetTab) => void;
  onDismiss: () => void;
}

export function AttachBottomBar({ active, onChange, onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={styles.tab}
              onPress={() => onChange(tab.id)}
            >
              <View style={[styles.iconBubble, selected && styles.iconBubbleActive]}>
                <Ionicons
                  name={selected ? tab.iconActive : tab.icon}
                  size={22}
                  color={selected ? tokens.accentBright : tokens.textMid}
                />
              </View>
              <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.dismiss}
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="Fechar anexos"
      >
        <Ionicons name="chevron-down" size={22} color={tokens.textLow} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.glassBorder,
    backgroundColor: tokens.shell,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  tab: {
    alignItems: 'center',
    gap: 6,
    minWidth: 72,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    backgroundColor: 'rgba(75, 117, 242, 0.22)',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textLow,
  },
  labelActive: {
    color: tokens.accentBright,
    fontWeight: '600',
  },
  dismiss: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
});
