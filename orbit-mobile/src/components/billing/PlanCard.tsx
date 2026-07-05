import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { PlanConfig } from '../../features/billing/plans';
import type { LunaPlanId } from '../../features/billing/types';
import { tokens } from '../../theme/tokens';

type FeatureRowProps = {
  label: string;
  available: boolean | 'limited';
  detail?: string;
  vivid: boolean;
};

function FeatureRow({ label, available, detail, vivid }: FeatureRowProps) {
  const iconName =
    available === true ? 'checkmark-circle' : available === 'limited' ? 'remove-circle' : 'close-circle';
  const iconColor =
    available === true
      ? vivid
        ? '#fff'
        : tokens.accentBright
      : available === 'limited'
        ? vivid
          ? 'rgba(255,255,255,0.75)'
          : '#FFB74D'
        : vivid
          ? 'rgba(255,255,255,0.35)'
          : tokens.textLow;

  return (
    <View style={styles.featureRow}>
      <Ionicons name={iconName} size={14} color={iconColor} />
      <Text style={[styles.featureLabel, vivid && styles.featureLabelVivid, available === false && styles.featureOff]}>
        {label}
      </Text>
      {detail ? (
        <View style={[styles.featureBadge, vivid && styles.featureBadgeVivid]}>
          <Text style={[styles.featureBadgeText, vivid && styles.featureBadgeTextVivid]}>{detail}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface Props {
  plan: PlanConfig;
  currentPlanId: LunaPlanId;
  billingPeriod: 'monthly' | 'annual';
  checkoutBusy?: boolean;
  checkoutAvailable?: boolean;
  onSelect: (plan: PlanConfig) => void;
}

export function PlanCard({
  plan,
  currentPlanId,
  billingPeriod,
  checkoutBusy,
  checkoutAvailable = true,
  onSelect,
}: Props) {
  const isCurrent = plan.id === currentPlanId;
  const vivid = plan.highlighted === true;

  const price =
    billingPeriod === 'annual' && plan.priceAnnualMonthly !== null
      ? plan.priceAnnualMonthly
      : plan.priceMonthly;

  const priceFormatted =
    price % 1 === 0 ? String(price) : price.toFixed(2).replace('.', ',');

  const canSubscribe = plan.id !== 'free' && checkoutAvailable && !isCurrent;

  return (
    <View style={[styles.card, vivid && styles.cardVivid]}>
      {plan.badge ? (
        <View style={[styles.badge, vivid && styles.badgeVivid]}>
          <Text style={[styles.badgeText, vivid && styles.badgeTextVivid]}>{plan.badge}</Text>
        </View>
      ) : null}

      <Text style={[styles.name, vivid && styles.nameVivid]}>{plan.name}</Text>
      <Text style={[styles.tagline, vivid && styles.taglineVivid]}>{plan.tagline}</Text>

      {plan.priceMonthly === 0 ? (
        <Text style={[styles.priceBig, vivid && styles.nameVivid]}>Grátis</Text>
      ) : (
        <View style={styles.priceRow}>
          <Text style={[styles.priceCurrency, vivid && styles.taglineVivid]}>R$</Text>
          <Text style={[styles.priceBig, vivid && styles.nameVivid]}>{priceFormatted}</Text>
          <Text style={[styles.pricePeriod, vivid && styles.taglineVivid]}>/mês</Text>
        </View>
      )}
      {billingPeriod === 'annual' && plan.priceAnnual ? (
        <Text style={[styles.annualNote, vivid && styles.taglineVivid]}>
          cobrado R${plan.priceAnnual}/ano
        </Text>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.features}>
        {plan.features.map((f) => (
          <FeatureRow key={f.label} vivid={vivid} {...f} />
        ))}
      </View>

      {plan.id === 'free' ? (
        <Text style={[styles.currentHint, vivid && styles.taglineVivid]}>
          {isCurrent ? 'Plano atual' : 'Plano base'}
        </Text>
      ) : (
        <Pressable
          disabled={!canSubscribe || checkoutBusy}
          onPress={() => canSubscribe && onSelect(plan)}
          style={({ pressed }) => [
            styles.cta,
            vivid && styles.ctaVivid,
            isCurrent && styles.ctaDisabled,
            !canSubscribe && styles.ctaDisabled,
            pressed && canSubscribe && styles.pressed,
          ]}
        >
          {checkoutBusy ? (
            <ActivityIndicator color={vivid ? tokens.accentDeep : '#fff'} size="small" />
          ) : (
            <Text
              style={[
                styles.ctaText,
                vivid && styles.ctaTextVivid,
                (isCurrent || !canSubscribe) && styles.ctaTextDisabled,
              ]}
            >
              {isCurrent
                ? 'Plano atual'
                : !checkoutAvailable
                  ? 'Em breve'
                  : `Assinar ${plan.name}`}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  cardVivid: {
    backgroundColor: tokens.accentDeep,
    borderColor: tokens.accent,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: tokens.accentSoft,
  },
  badgeVivid: { backgroundColor: 'rgba(255,255,255,0.2)' },
  badgeText: { color: tokens.accentBright, fontSize: 10, fontWeight: '700' },
  badgeTextVivid: { color: '#fff' },
  name: { color: tokens.textHigh, fontSize: 17, fontWeight: '700' },
  nameVivid: { color: '#fff' },
  tagline: { color: tokens.textMid, fontSize: 13 },
  taglineVivid: { color: 'rgba(255,255,255,0.75)' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceCurrency: { color: tokens.textMid, fontSize: 13 },
  priceBig: { color: tokens.textHigh, fontSize: 28, fontWeight: '800' },
  pricePeriod: { color: tokens.textMid, fontSize: 13 },
  annualNote: { color: tokens.textLow, fontSize: 11, marginTop: -4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.glassBorder,
    marginVertical: 4,
  },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureLabel: { flex: 1, color: tokens.textMid, fontSize: 12 },
  featureLabelVivid: { color: 'rgba(255,255,255,0.9)' },
  featureOff: { opacity: 0.45 },
  featureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: tokens.glassStrong,
  },
  featureBadgeVivid: { backgroundColor: 'rgba(255,255,255,0.15)' },
  featureBadgeText: { color: tokens.textLow, fontSize: 9, fontWeight: '600' },
  featureBadgeTextVivid: { color: 'rgba(255,255,255,0.85)' },
  currentHint: {
    textAlign: 'center',
    color: tokens.textLow,
    fontSize: 13,
    paddingVertical: 10,
  },
  cta: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: tokens.accent,
  },
  ctaVivid: { backgroundColor: '#fff' },
  ctaDisabled: { backgroundColor: tokens.glassStrong, opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ctaTextVivid: { color: tokens.accentDeep },
  ctaTextDisabled: { color: tokens.textLow },
  pressed: { opacity: 0.9 },
});
