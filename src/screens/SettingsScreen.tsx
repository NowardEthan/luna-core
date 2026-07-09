import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { LunaProviderPicker } from '../components/LunaProviderPicker';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
import { limitsSettingsDetail } from '../features/billing/limitsSummary';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useLunaBilling } from '../hooks/useLunaBilling';
import { useLunaUsageContext } from '../hooks/LunaUsageContext';
import { PLAN_DISPLAY_LABELS } from '../features/billing/plans';
import { isAutoProviderSelection } from '../lib/lunaProviderSettings';
import { LimitsScreen } from './LimitsScreen';
import { PlansScreen } from './PlansScreen';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  isAnonymous: boolean;
  onResetSession: () => Promise<void>;
  /** Abre o ecrã Limites ao montar (ex.: vindo do composer). */
  autoOpenLimits?: boolean;
  onAutoOpenLimitsHandled?: () => void;
}

/** Aba Ajustes — linguagem simples para utilizadores finais. */
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

  const statusLoading = !lunaProvider.loaded || lunaProvider.refreshing;
  const apiOnline = lunaProvider.apiReachable && lunaProvider.health?.ok === true;
  const onlineLabel = apiOnline ? 'Luna disponível' : 'Sem conexão com o servidor';
  const onlineDetail = apiOnline
    ? 'Pode conversar normalmente'
    : 'Verifique a internet e tente de novo';

  const accountLabel = isAnonymous ? 'Visitante' : 'Conta Google';
  const accountDetail = isAnonymous
    ? 'Conversas só neste dispositivo'
    : 'Conversas salvas na nuvem';

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
        <Text style={type.displayName}>Ajustes</Text>
        <Text style={type.tagline}>Conta, plano e preferências</Text>

        <SettingsSection title="Sua conta">
          <SettingsRow
            icon={isAnonymous ? 'person-outline' : 'logo-google'}
            label={accountLabel}
            detail={accountDetail}
          />
          <SettingsRow
            icon="diamond-outline"
            iconColor={tokens.accentBright}
            label="Plano Luna"
            detail={`${PLAN_DISPLAY_LABELS[billing.plan]}${billing.onTrial ? ' · trial' : ''}`}
            value={billing.billingOverdue ? 'Pagamento pendente' : undefined}
            showChevron
            onPress={() => setPlansOpen(true)}
          />
          {showLimitsRow ? (
            <SettingsRow
              icon="speedometer-outline"
              iconColor={lunaUsage.isExceeded ? '#E57373' : tokens.accentBright}
              label="Limites de uso"
              detail={limitsDetail}
              showChevron
              onPress={() => setLimitsOpen(true)}
            />
          ) : null}
          <SettingsRow
            icon={apiOnline ? 'wifi-outline' : 'cloud-offline-outline'}
            iconColor={apiOnline ? tokens.online : '#E57373'}
            label="Conexão"
            detail={onlineDetail}
            value={onlineLabel}
            showChevron
            onPress={() => void lunaProvider.refreshFromServer()}
            last
          />
        </SettingsSection>

        <SettingsSection
          title="Resposta da Luna"
          footer={
            isAutoProviderSelection(lunaProvider.selection)
              ? 'A Luna escolhe automaticamente a melhor forma de responder.'
              : 'Preferência manual — vale para as próximas mensagens.'
          }
        >
          {statusLoading ? (
            <ActivityIndicator color={tokens.accent} style={styles.loader} />
          ) : (
            <View style={styles.embeddedPicker}>
              <LunaProviderPicker
                options={lunaProvider.options}
                selection={lunaProvider.selection}
                onSelect={(next) => void lunaProvider.setProvider(next)}
                disabled={statusLoading}
                apiReachable={lunaProvider.apiReachable}
                compact
                planId={billing.plan}
              />
            </View>
          )}
        </SettingsSection>

        <SettingsSection
          title="Raciocínio"
          footer="Quando ativo, a Luna mostra o passo a passo do pensamento dela. Desativar não muda a resposta."
        >
          <SettingsRow
            icon="sparkles-outline"
            label="Mostrar raciocínio"
            detail="Deixa o bloco de pensamento visível"
            toggle
            toggled={lunaProvider.reasoningEnabled}
            onToggle={(enabled) => void lunaProvider.setReasoningEnabled(enabled)}
            last={!lunaProvider.reasoningEnabled}
          />
          {lunaProvider.reasoningEnabled && (
            <SettingsRow
              icon="layers-outline"
              label="Profundidade"
              detail="Quanto mais alto, mais etapas de raciocínio"
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
            detail="Volta para a tela inicial"
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
          <View style={styles.betaBadge}>
            <Text style={styles.betaText}>V2.0.1</Text>
          </View>
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
  container: { paddingHorizontal: 20, paddingBottom: 36 },
  embeddedPicker: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  loader: { paddingVertical: 16 },
  about: { marginTop: 28, alignItems: 'center' },
  aboutText: { color: tokens.textLow, fontSize: 12, fontWeight: '500' },
  betaBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(136, 193, 242, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(136, 193, 242, 0.35)',
  },
  betaText: {
    color: '#88C1F2',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
