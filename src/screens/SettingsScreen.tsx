import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
import { limitsSettingsDetail } from '../features/billing/limitsSummary';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useLunaBilling } from '../hooks/useLunaBilling';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { PLAN_DISPLAY_LABELS } from '../features/billing/plans';
import { LimitsScreen } from './LimitsScreen';
import { PlansScreen } from './PlansScreen';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { tokens } from '../theme/tokens';
import { layout } from '../theme/layout';
import { type } from '../theme/typography';

interface Props {
  isAnonymous: boolean;
  onResetSession: () => Promise<void>;
  /** Abre o ecrã Limites ao montar (ex.: vindo do composer). */
  autoOpenLimits?: boolean;
  onAutoOpenLimitsHandled?: () => void;
}

/** Aba Definições — organizada como produto, não como painel técnico. */
export function SettingsScreen({
  isAnonymous,
  onResetSession,
  autoOpenLimits,
  onAutoOpenLimitsHandled,
}: Props) {
  const headerTopPad = useHeaderTopPadding(10);
  const auth = useLunaAuth();
  const lunaProvider = useLunaProvider();
  const billing = useLunaBilling(auth.uid, auth.getIdToken, isAnonymous);
  const lunaUsage = useLunaUsageContext();

  const [resetting, setResetting] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  useEffect(() => {
    if (!autoOpenLimits) return;
    setLimitsOpen(true);
    onAutoOpenLimitsHandled?.();
  }, [autoOpenLimits, onAutoOpenLimitsHandled]);

  useAndroidBackHandler(
    useCallback(() => {
      if (limitsOpen) {
        setLimitsOpen(false);
        return true;
      }
      if (plansOpen) {
        setPlansOpen(false);
        return true;
      }
      return false;
    }, [limitsOpen, plansOpen]),
    limitsOpen || plansOpen,
  );

  const apiOnline = lunaProvider.apiReachable && lunaProvider.health?.ok === true;
  const onlineLabel = apiOnline ? 'Disponível' : 'Offline';
  const onlineDetail = apiOnline
    ? 'Servidor pronto para novas conversas'
    : 'Toque para tentar reconectar';

  const accountLabel = isAnonymous ? 'Modo visitante' : 'Conta Google';
  const accountDetail = isAnonymous
    ? 'Perfil local neste aparelho'
    : auth.user?.email ?? 'Conversas sincronizadas';
  const planLabel = `${PLAN_DISPLAY_LABELS[billing.plan]}${billing.onTrial ? ' · trial' : ''}`;

  const showLimitsRow = lunaUsage.quotaApplies;
  const limitsDetail = limitsSettingsDetail(
    lunaUsage.usage,
    lunaUsage.remaining,
    lunaUsage.isExceeded,
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingTop: headerTopPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={type.displayName}>Definições</Text>
          <Text style={type.tagline}>Conta, plano e comportamento da Luna.</Text>
        </View>

        <View style={styles.overview}>
          <View style={styles.overviewTop}>
            <View style={styles.overviewIcon}>
              <Ionicons name="sparkles" size={20} color={tokens.accentBright} />
            </View>
            <View style={styles.overviewText}>
              <Text style={styles.overviewTitle}>Orbit mobile</Text>
              <Text style={styles.overviewSubtitle} numberOfLines={1}>
                {accountLabel} · {planLabel}
              </Text>
            </View>
            <View style={[styles.statusDot, !apiOnline && styles.statusDotOff]} />
          </View>

          <Pressable
            onPress={showLimitsRow ? () => setLimitsOpen(true) : () => setPlansOpen(true)}
            style={({ pressed }) => [styles.usageCallout, pressed && styles.usageCalloutPressed]}
            accessibilityRole="button"
            accessibilityLabel={showLimitsRow ? 'Abrir limites de uso' : 'Abrir planos'}
          >
            <View style={styles.usageText}>
              <Text style={styles.usageLabel}>{showLimitsRow ? 'Uso atual' : 'Plano atual'}</Text>
              <Text style={styles.usageDetail} numberOfLines={2}>
                {showLimitsRow ? limitsDetail : 'Veja recursos, limites e opções de upgrade.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.textLow} />
          </Pressable>
        </View>

        <SettingsSection title="Conta e plano">
          <SettingsRow
            icon={isAnonymous ? 'person-outline' : 'logo-google'}
            label={accountLabel}
            detail={accountDetail}
          />
          <SettingsRow
            icon="diamond-outline"
            iconColor={tokens.accentBright}
            label="Plano Luna"
            detail={planLabel}
            value={billing.billingOverdue ? 'Pagamento pendente' : undefined}
            showChevron
            onPress={() => setPlansOpen(true)}
          />
          {showLimitsRow ? (
            <SettingsRow
              icon="speedometer-outline"
              iconColor={lunaUsage.isExceeded ? tokens.error : tokens.accentBright}
              label="Limites de uso"
              detail={limitsDetail}
              showChevron
              onPress={() => setLimitsOpen(true)}
            />
          ) : null}
          <SettingsRow
            icon={apiOnline ? 'wifi-outline' : 'cloud-offline-outline'}
            iconColor={apiOnline ? tokens.online : tokens.error}
            label="Conexão"
            detail={onlineDetail}
            value={onlineLabel}
            showChevron
            onPress={() => void lunaProvider.refreshFromServer()}
            last
          />
        </SettingsSection>

        <SettingsSection
          title="Modo de resposta"
          footer="A Luna escolhe o modelo a cada mensagem — leve e rápido no papo, profundo quando o assunto pede. Assim ela responde melhor gastando menos."
        >
          <SettingsRow
            icon="flash-outline"
            label="Automático"
            detail="A Luna decide o modelo por mensagem, priorizando eficiência"
            last
          />
        </SettingsSection>

        <SettingsSection
          title="Transparência"
          footer="Use quando quiser acompanhar como a resposta está sendo construída."
        >
          <SettingsRow
            icon="sparkles-outline"
            label="Mostrar raciocínio"
            detail="Exibe o processo quando o modelo enviar etapas visíveis"
            toggle
            toggled={lunaProvider.reasoningEnabled}
            onToggle={(enabled) => void lunaProvider.setReasoningEnabled(enabled)}
            last={!lunaProvider.reasoningEnabled}
          />
          {lunaProvider.reasoningEnabled && (
            <SettingsRow
              icon="layers-outline"
              label="Profundidade"
              detail="Controla o esforço nas próximas respostas"
              value={
                lunaProvider.reasoningEffort === 'low'
                  ? 'Baixa'
                  : lunaProvider.reasoningEffort === 'high'
                    ? 'Alta'
                    : 'Média'
              }
              showChevron
              onPress={() => {
                const next: typeof lunaProvider.reasoningEffort[] = ['low', 'medium', 'high'];
                const idx = next.indexOf(lunaProvider.reasoningEffort);
                void lunaProvider.setReasoningEffort(next[(idx + 1) % next.length]);
              }}
              last
            />
          )}
        </SettingsSection>

        <SettingsSection title="Sessão">
          <SettingsRow
            icon="log-out-outline"
            iconColor="#E57373"
            label={isAnonymous ? 'Sair deste dispositivo' : 'Sair da conta'}
            detail="Encerra a sessão atual"
            destructive
            loading={resetting}
            last
            onPress={() => {
              setResetting(true);
              void onResetSession().finally(() => setResetting(false));
            }}
          />
        </SettingsSection>

        <View style={styles.about}>
          <Text style={styles.aboutText}>Orbit · Luna no bolso</Text>
          <Text style={styles.versionText}>v2.0.1</Text>
        </View>
      </ScrollView>

      <LimitsScreen
        visible={limitsOpen}
        onClose={() => setLimitsOpen(false)}
        planId={billing.plan}
        usage={lunaUsage.usage}
        remaining={lunaUsage.remaining}
        exceeded={lunaUsage.isExceeded}
        onOpenPlans={() => setPlansOpen(true)}
      />

      <PlansScreen
        visible={plansOpen}
        onClose={() => setPlansOpen(false)}
        planId={billing.plan}
        billing={billing.billing}
        billingOverdue={billing.billingOverdue}
        onTrial={billing.onTrial}
        usage={lunaUsage.usage}
        remaining={lunaUsage.remaining}
        exceeded={lunaUsage.isExceeded}
        isAnonymous={isAnonymous}
        getIdToken={auth.getIdToken}
        onRefreshAccount={billing.refreshAccount}
        onOpenLimits={() => {
          setPlansOpen(false);
          setLimitsOpen(true);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: layout.screenPaddingX, paddingBottom: 36 },
  header: { marginBottom: 18 },
  overview: {
    borderRadius: 8,
    backgroundColor: tokens.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderSubtle,
    padding: 14,
  },
  overviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overviewIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.accentSoft,
  },
  overviewText: { flex: 1, minWidth: 0 },
  overviewTitle: { color: tokens.textHigh, fontSize: 16, fontWeight: '700' },
  overviewSubtitle: { color: tokens.textMid, fontSize: 13, marginTop: 2 },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: tokens.online,
  },
  statusDotOff: { backgroundColor: tokens.error },
  usageCallout: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  usageCalloutPressed: { opacity: 0.82 },
  usageText: { flex: 1, minWidth: 0 },
  usageLabel: { color: tokens.textHigh, fontSize: 13, fontWeight: '700' },
  usageDetail: { color: tokens.textMid, fontSize: 12, lineHeight: 17, marginTop: 3 },
  about: { marginTop: 28, alignItems: 'center' },
  aboutText: { color: tokens.textLow, fontSize: 12, fontWeight: '500' },
  versionText: { color: tokens.textLow, fontSize: 11, marginTop: 4 },
});
