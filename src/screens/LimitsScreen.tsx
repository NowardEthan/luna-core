import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LimitsDetailPanel } from '../components/billing/LimitsDetailPanel';
import {
  limitsHeroRemaining,
  limitsHeroSubtitle,
} from '../features/billing/limitsSummary';
import { PLAN_DISPLAY_LABELS } from '../features/billing/plans';
import type { LunaUsageSnapshot } from '../features/billing/useLunaUsage';
import type { LunaPlanId } from '../features/billing/types';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  planId: LunaPlanId;
  usage: LunaUsageSnapshot;
  remaining: number | null;
  exceeded: boolean;
  onOpenPlans?: () => void;
}

/** Consumo do plano — ecrã dedicado em Ajustes. */
export function LimitsScreen({
  visible,
  onClose,
  planId,
  usage,
  remaining,
  exceeded,
  onOpenPlans,
}: Props) {
  const headerTopPad = useHeaderTopPadding(12);
  const heroNumber = limitsHeroRemaining(remaining, exceeded);
  const heroSub = limitsHeroSubtitle(usage, exceeded);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: headerTopPad }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={tokens.textHigh} />
          </Pressable>
          <Text style={styles.headerTitle}>Limites de uso</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, exceeded && styles.heroExceeded]}>
            {usage.loading ? (
              <ActivityIndicator color={tokens.accent} style={styles.heroLoader} />
            ) : (
              <Text style={[styles.heroNumber, exceeded && styles.heroNumberExceeded]}>
                {heroNumber}
              </Text>
            )}
            <Text style={styles.heroLabel}>
              {exceeded ? 'sem tokens agora' : 'tokens restantes'}
            </Text>
            <Text style={styles.heroSub}>{heroSub}</Text>
            <Text style={styles.planTag}>Plano {PLAN_DISPLAY_LABELS[planId]}</Text>
          </View>

          {usage.cycle !== 'unlimited' ? <LimitsDetailPanel usage={usage} /> : null}

          {onOpenPlans ? (
            <Pressable
              onPress={() => {
                onClose();
                onOpenPlans();
              }}
              style={({ pressed }) => [styles.plansBtn, pressed && styles.plansBtnPressed]}
            >
              <Ionicons name="diamond-outline" size={18} color={tokens.accentBright} />
              <Text style={styles.plansBtnText}>Ver planos Luna</Text>
              <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.ink1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
    gap: 6,
  },
  heroExceeded: {
    borderColor: 'rgba(229, 115, 115, 0.35)',
    backgroundColor: 'rgba(229, 115, 115, 0.06)',
  },
  heroLoader: { marginVertical: 12 },
  heroNumber: {
    color: tokens.textHigh,
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  heroNumberExceeded: { color: '#E57373' },
  heroLabel: { color: tokens.textMid, fontSize: 15, fontWeight: '500' },
  heroSub: {
    color: tokens.textLow,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 2,
  },
  planTag: {
    marginTop: 8,
    color: tokens.accentText,
    fontSize: 12,
    fontWeight: '600',
  },
  plansBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
  },
  plansBtnPressed: { opacity: 0.88 },
  plansBtnText: { flex: 1, color: tokens.textHigh, fontSize: 15, fontWeight: '500' },
});
