import React, { memo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePressSpring } from '../hooks/usePressSpring';
import { tokens } from '../theme/tokens';

export type OrbitTabId = 'inicio' | 'conversas' | 'lumen' | 'conta';

export const TAB_BAR_HEIGHT = 56;

interface TabItem {
  id: OrbitTabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const LEFT: TabItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home-outline', iconActive: 'home' },
  { id: 'conversas', label: 'Conversas', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
];

const RIGHT: TabItem[] = [
  { id: 'lumen', label: 'Lumen', icon: 'sparkles-outline', iconActive: 'sparkles' },
  { id: 'conta', label: 'Conta', icon: 'person-outline', iconActive: 'person' },
];

interface Props {
  active: OrbitTabId;
  onTab: (tab: OrbitTabId) => void;
  onNewChat: () => void;
}

export const OrbitTabBar = memo(function OrbitTabBar({ active, onTab, onNewChat }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {LEFT.map((tab) => (
            <TabButton key={tab.id} tab={tab} active={active === tab.id} onPress={() => onTab(tab.id)} />
          ))}
        </View>

        <View style={styles.centerSlot}>
          <PressScale onPress={onNewChat} accessibilityLabel="Nova conversa" style={styles.ctaHit}>
            <LinearGradient
              colors={[tokens.accentBright, tokens.accent]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.cta}
            >
              <Ionicons name="add" size={28} color={tokens.onAccent} />
            </LinearGradient>
          </PressScale>
        </View>

        <View style={styles.side}>
          {RIGHT.map((tab) => (
            <TabButton key={tab.id} tab={tab} active={active === tab.id} onPress={() => onTab(tab.id)} />
          ))}
        </View>
      </View>
    </View>
  );
});

function PressScale({
  children,
  onPress,
  hitStyle,
  style,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
}: {
  children: React.ReactNode;
  onPress: () => void;
  hitStyle?: ViewStyle;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: 'tab' | 'button';
  accessibilityState?: { selected?: boolean };
}) {
  const { scale, onPressIn, onPressOut, enabled } = usePressSpring();

  if (!enabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [hitStyle, styles.pressInner, style, pressed && styles.pressedLite]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={hitStyle}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={[styles.pressInner, style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const TabButton = memo(function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      hitStyle={styles.tabBtn}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={active ? tab.iconActive : tab.icon}
        size={22}
        color={active ? tokens.accentText : tokens.textLow}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
    </PressScale>
  );
});

const CTA_SIZE = 56;

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: tokens.glassBorder,
    backgroundColor: 'rgba(14, 16, 20, 0.92)',
  },
  bar: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  centerSlot: {
    width: CTA_SIZE + 16,
    alignItems: 'center',
    marginTop: -(CTA_SIZE / 2 - 4),
  },
  ctaHit: {
    shadowColor: tokens.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cta: {
    width: CTA_SIZE,
    height: CTA_SIZE,
    borderRadius: CTA_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: tokens.ink1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 3,
  },
  pressedLite: {
    opacity: 0.82,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textLow,
  },
  tabLabelActive: {
    color: tokens.accentText,
    fontWeight: '600',
  },
});
