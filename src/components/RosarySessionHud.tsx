import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getRosaryTurnDetail, MYSTERY_SET_LABELS } from '../lib/rosary/rosaryTexts';
import {
  formatRosaryProgress,
  type PrayerMode,
  type RosaryMysterySet,
  type RosaryState,
} from '../hooks/useRosary';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  state: RosaryState;
  beadCurrent: number;
  beadTotal: number;
  prayerMode: PrayerMode | null;
  onToggleMode: () => void;
  onStop: () => void;
  onReflection?: () => void;
  onHeightChange?: (height: number) => void;
};

const VISIBLE_BEADS = 14;

function BeadDot({
  filled,
  active,
  pulse,
}: {
  filled: boolean;
  active: boolean;
  pulse: Animated.Value;
}) {
  const scale = active
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] })
    : 1;
  const opacity = active
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })
    : filled
      ? 0.92
      : 0.35;

  return (
    <Animated.View
      style={[
        styles.bead,
        filled && styles.beadFilled,
        active && styles.beadActive,
        { opacity, transform: [{ scale }] },
      ]}
    />
  );
}

function HudIconButton({
  onPress,
  icon,
  label,
  color = tokens.textMid,
}: {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

export const RosarySessionHud = memo(function RosarySessionHud({
  state,
  beadCurrent,
  beadTotal,
  prayerMode,
  onToggleMode,
  onStop,
  onReflection,
  onHeightChange,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(state.step === 'intro');

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (state.step === 'intro') {
      setExpanded(true);
    }
  }, [state.step]);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    onHeightChange?.(event.nativeEvent.layout.height);
  };

  if (!state.active) return null;

  const setLabel = MYSTERY_SET_LABELS[state.mysterySet as RosaryMysterySet];
  const turnDetail = getRosaryTurnDetail(state, prayerMode);
  const progressLabel = formatRosaryProgress(state);
  const isIntro = state.step === 'intro';
  const summary = `${setLabel} · ${progressLabel}`;
  const windowStart = Math.max(0, Math.min(beadCurrent - 6, beadTotal - VISIBLE_BEADS));
  const beads = Array.from({ length: VISIBLE_BEADS }, (_, i) => {
    const index = windowStart + i + 1;
    return {
      index,
      filled: index < beadCurrent,
      active: index === beadCurrent,
    };
  }).filter((b) => b.index <= beadTotal);

  return (
    <View
      style={styles.hud}
      onLayout={handleLayout}
      pointerEvents="box-none"
      accessibilityRole="summary"
    >
      <View style={styles.panel}>
        <Pressable
          onPress={toggleExpanded}
          style={[styles.headerRow, expanded && styles.headerRowExpanded]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Recolher painel do terço' : `Expandir painel do terço — ${summary}`}
          accessibilityState={{ expanded }}
        >
          <View style={styles.headerLeading}>
            <View style={styles.flowerBadge}>
              <Ionicons name="flower" size={14} color={tokens.accentBright} />
            </View>
            {expanded ? (
              <View style={styles.headerTextWrap}>
                <View style={styles.turnRow}>
                  <Ionicons
                    name={
                      isIntro
                        ? 'hand-left-outline'
                        : prayerMode === 'together'
                          ? 'repeat-outline'
                          : 'create-outline'
                    }
                    size={13}
                    color={tokens.accentBright}
                  />
                  <Text style={styles.turnLabel}>Sua vez</Text>
                </View>
                <Text style={styles.turnDetail} numberOfLines={1}>
                  {turnDetail}
                </Text>
              </View>
            ) : (
              <Text style={styles.summaryText} numberOfLines={1}>
                {summary}
              </Text>
            )}
          </View>

          <View style={styles.headerTrailing}>
            {!expanded ? (
              <View style={styles.miniBeads}>
                {beads.slice(0, 5).map((b) => (
                  <BeadDot key={b.index} filled={b.filled} active={b.active} pulse={pulse} />
                ))}
              </View>
            ) : null}
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={tokens.textLow}
            />
          </View>
        </Pressable>

        {expanded ? (
          <View style={styles.body}>
            <Text style={styles.metaLine} numberOfLines={1}>
              {setLabel} · {progressLabel}
            </Text>

            <View style={styles.beadsRow}>
              <View style={styles.beadTrack}>
                {beads.map((b) => (
                  <BeadDot key={b.index} filled={b.filled} active={b.active} pulse={pulse} />
                ))}
              </View>
              <View style={styles.actions}>
                <HudIconButton
                  onPress={onToggleMode}
                  icon={prayerMode === 'together' ? 'people-outline' : 'person-outline'}
                  label={prayerMode === 'together' ? 'Modo junto' : 'Modo sozinho'}
                  color={tokens.accentBright}
                />
                {onReflection ? (
                  <HudIconButton
                    onPress={onReflection}
                    icon="sparkles-outline"
                    label="Reflexão"
                    color={tokens.accentBright}
                  />
                ) : null}
                <HudIconButton onPress={onStop} icon="close" label="Parar terço" />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    paddingHorizontal: 10,
    paddingTop: 6,
    pointerEvents: 'box-none',
  },
  panel: {
    borderRadius: 16,
    backgroundColor: tokens.shell,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerRowExpanded: {
    paddingBottom: 8,
  },
  headerLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  flowerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
    flexShrink: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryText: {
    ...type.caption,
    flex: 1,
    color: tokens.textHigh,
    fontSize: 13,
    fontWeight: '600',
  },
  headerTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  turnLabel: {
    ...type.caption,
    color: tokens.accentBright,
    fontWeight: '700',
    fontSize: 12,
  },
  turnDetail: {
    ...type.caption,
    color: tokens.textMid,
    fontSize: 11,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  metaLine: {
    ...type.caption,
    color: tokens.textMid,
    fontSize: 11,
    fontWeight: '500',
  },
  beadsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beadTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 0,
    paddingVertical: 2,
  },
  miniBeads: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(180, 160, 220, 0.4)',
    backgroundColor: 'transparent',
  },
  beadFilled: {
    backgroundColor: 'rgba(140, 120, 200, 0.6)',
  },
  beadActive: {
    borderColor: tokens.accentBright,
    backgroundColor: tokens.accent,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconBtnPressed: {
    opacity: 0.7,
  },
});
