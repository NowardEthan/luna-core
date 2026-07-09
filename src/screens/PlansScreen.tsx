import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CpfCnpjSheet } from '../components/billing/CpfCnpjSheet';
import { PlanCard } from '../components/billing/PlanCard';
import { limitsSettingsDetail } from '../features/billing/limitsSummary';
import { isLunaBillingApiConfigured } from '../config/lunaBillingApi';
import {
  isPlanCheckoutAvailable,
  startAsaasCheckout,
  startCreditPackCheckout,
} from '../features/billing/billingApi';
import type { BillingPeriod } from '../features/billing/billingApi';
import { daysUntilDate, formatNextDueDate } from '../features/billing/parseBilling';
import { MOBILE_CHECKOUT_PLANS, PLAN_DISPLAY_LABELS, PLANS } from '../features/billing/plans';
import type { PlanConfig } from '../features/billing/plans';
import type { LunaUsageSnapshot } from '../features/billing/useLunaUsage';
import type { LunaBillingState, LunaPlanId } from '../features/billing/types';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { hapticConfirm, hapticError } from '../lib/haptics';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  planId: LunaPlanId;
  billing: LunaBillingState | null;
  billingOverdue: boolean;
  onTrial: boolean;
  usage: LunaUsageSnapshot;
  remaining: number | null;
  exceeded?: boolean;
  isAnonymous: boolean;
  getIdToken: () => Promise<string | null>;
  onRefreshAccount: () => Promise<void>;
  onOpenLimits?: () => void;
}

/** Ecrã de planos e assinatura — port do LunarGate (orbit-legacy). */
export function PlansScreen({
  visible,
  onClose,
  planId,
  billing,
  billingOverdue,
  onTrial,
  usage,
  remaining,
  exceeded,
  isAnonymous,
  getIdToken,
  onRefreshAccount,
  onOpenLimits,
}: Props) {
  const headerTopPad = useHeaderTopPadding(12);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cpfOpen, setCpfOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanConfig | null>(null);
  const [creditPack, setCreditPack] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkoutAvailable = isPlanCheckoutAvailable();
  const nextDueLabel = formatNextDueDate(billing?.nextDueDate);
  const renewDays = daysUntilDate(billing?.nextDueDate);

  useEffect(() => {
    if (!visible) return;
    void onRefreshAccount();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible, onRefreshAccount]);

  const startPlanPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    const stopAt = Date.now() + 120_000;
    void onRefreshAccount();
    pollRef.current = setInterval(() => {
      void onRefreshAccount();
      if (Date.now() > stopAt && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 5_000);
  };

  const openCheckout = async (digits: string) => {
    setCheckoutBusy(true);
    try {
      const result = creditPack
        ? await startCreditPackCheckout(digits, getIdToken)
        : await startAsaasCheckout(pendingPlan!.id, period, digits, getIdToken);

      if (result.ok) {
        hapticConfirm();
        await Linking.openURL(result.url);
        startPlanPoll();
        setToast('Conclua o pagamento no navegador — o plano atualiza em instantes.');
      } else {
        hapticError();
        setToast(result.error);
      }
    } finally {
      setCheckoutBusy(false);
      setPendingPlan(null);
      setCreditPack(false);
    }
  };

  const handleSelectPlan = (plan: PlanConfig) => {
    if (isAnonymous) {
      setToast('Entre com Google para assinar um plano.');
      return;
    }
    setPendingPlan(plan);
    setCreditPack(false);
    setCpfOpen(true);
  };

  const handleCreditPack = () => {
    if (isAnonymous) {
      setToast('Entre com Google para comprar créditos.');
      return;
    }
    setCreditPack(true);
    setPendingPlan(null);
    setCpfOpen(true);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: headerTopPad }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={tokens.textHigh} />
          </Pressable>
          <Text style={styles.headerTitle}>Plano Luna</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {toast ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
              <Pressable onPress={() => setToast(null)}>
                <Ionicons name="close" size={18} color={tokens.textMid} />
              </Pressable>
            </View>
          ) : null}

          {onTrial ? (
            <View style={styles.bannerTrial}>
              <Text style={styles.bannerTrialText}>
                Está no trial Pro de 7 dias — aproveite todos os recursos!
              </Text>
            </View>
          ) : null}

          {billingOverdue ? (
            <View style={styles.bannerWarn}>
              <Text style={styles.bannerWarnText}>
                Pagamento em atraso — regularize para manter o plano ativo.
              </Text>
            </View>
          ) : null}

          <View style={styles.currentPlan}>
            <Text style={styles.currentLabel}>Plano atual</Text>
            <Text style={styles.currentValue}>{PLAN_DISPLAY_LABELS[planId]}</Text>
            {planId !== 'free' && nextDueLabel ? (
              <Text style={styles.renewal}>
                {renewDays !== null && renewDays <= 14
                  ? `Renova em ${renewDays} dias`
                  : `Próxima cobrança: ${nextDueLabel}`}
              </Text>
            ) : null}
          </View>

          {usage.cycle !== 'unlimited' && onOpenLimits ? (
            <Pressable
              onPress={onOpenLimits}
              style={({ pressed }) => [styles.limitsLink, pressed && styles.limitsLinkPressed]}
            >
              <Ionicons name="speedometer-outline" size={18} color={tokens.accentBright} />
              <View style={styles.limitsLinkText}>
                <Text style={styles.limitsLinkTitle}>Limites de uso</Text>
                <Text style={styles.limitsLinkDetail}>
                  {limitsSettingsDetail(usage, remaining, Boolean(exceeded))}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
            </Pressable>
          ) : null}

          {isAnonymous ? (
            <View style={styles.guestHint}>
              <Ionicons name="information-circle-outline" size={20} color={tokens.accentBright} />
              <Text style={styles.guestHintText}>
                Vincule uma conta Google no Perfil para assinar e sincronizar conversas.
              </Text>
            </View>
          ) : null}

          {!isLunaBillingApiConfigured() ? (
            <View style={styles.guestHint}>
              <Text style={styles.guestHintText}>
                Pagamentos online em breve. Por enquanto continue usando o plano gratuito.
              </Text>
            </View>
          ) : null}

          <View style={styles.periodRow}>
            <Pressable
              onPress={() => setPeriod('monthly')}
              style={[styles.periodPill, period === 'monthly' && styles.periodPillActive]}
            >
              <Text style={[styles.periodText, period === 'monthly' && styles.periodTextActive]}>
                Mensal
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPeriod('annual')}
              style={[styles.periodPill, period === 'annual' && styles.periodPillActive]}
            >
              <Text style={[styles.periodText, period === 'annual' && styles.periodTextActive]}>
                Anual
              </Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>-17%</Text>
              </View>
            </Pressable>
          </View>

          {PLANS.filter((p) => p.id === 'free').map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={planId}
              billingPeriod={period}
              checkoutAvailable={checkoutAvailable}
              onSelect={handleSelectPlan}
            />
          ))}

          {MOBILE_CHECKOUT_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={planId}
              billingPeriod={period}
              checkoutBusy={checkoutBusy}
              checkoutAvailable={checkoutAvailable}
              onSelect={handleSelectPlan}
            />
          ))}

          {checkoutAvailable && !isAnonymous && planId !== 'byok' ? (
            <Pressable
              onPress={handleCreditPack}
              disabled={checkoutBusy}
              style={({ pressed }) => [styles.packBtn, pressed && styles.pressed]}
            >
              {checkoutBusy ? (
                <ActivityIndicator color={tokens.accentBright} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color={tokens.accentBright} />
                  <View style={styles.packCol}>
                    <Text style={styles.packTitle}>Pack +500 mensagens</Text>
                    <Text style={styles.packDetail}>R$ 9 · válido até o fim do mês</Text>
                  </View>
                </>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      <CpfCnpjSheet
        visible={cpfOpen}
        onClose={() => {
          setCpfOpen(false);
          setPendingPlan(null);
          setCreditPack(false);
        }}
        onConfirm={(digits) => {
          setCpfOpen(false);
          void openCheckout(digits);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.ink0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: tokens.textHigh,
    fontSize: 17,
    fontWeight: '700',
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
  },
  toastText: { flex: 1, color: tokens.textMid, fontSize: 13, lineHeight: 18 },
  bannerTrial: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.accent,
  },
  bannerTrialText: { color: tokens.accentBright, fontSize: 13, lineHeight: 18 },
  bannerWarn: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,183,77,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFB74D',
  },
  bannerWarnText: { color: '#FFB74D', fontSize: 13, lineHeight: 18 },
  currentPlan: { gap: 4 },
  currentLabel: { color: tokens.textMid, fontSize: 13 },
  currentValue: { color: tokens.textHigh, fontSize: 22, fontWeight: '800' },
  renewal: { color: tokens.textLow, fontSize: 12 },
  limitsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
  },
  limitsLinkPressed: { opacity: 0.88 },
  limitsLinkText: { flex: 1, gap: 2 },
  limitsLinkTitle: { color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  limitsLinkDetail: { color: tokens.textMid, fontSize: 12 },
  guestHint: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
  },
  guestHintText: { flex: 1, color: tokens.textMid, fontSize: 13, lineHeight: 18 },
  periodRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  periodPillActive: {
    backgroundColor: tokens.accentSoft,
    borderColor: tokens.accent,
  },
  periodText: { color: tokens.textMid, fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: tokens.accentBright },
  saveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: tokens.accent,
  },
  saveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  packBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    marginTop: 4,
  },
  packCol: { flex: 1, gap: 2 },
  packTitle: { color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  packDetail: { color: tokens.textMid, fontSize: 12 },
  pressed: { opacity: 0.88 },
});
