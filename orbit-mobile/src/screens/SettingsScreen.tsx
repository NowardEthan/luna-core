import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { LunaProviderPicker } from '../components/LunaProviderPicker';
import { UsageMeter } from '../components/billing/UsageMeter';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { useLunaAuth } from '../hooks/useLunaAuth';
import { useLunaBilling } from '../hooks/useLunaBilling';
import { useLunaUsage } from '../features/billing/useLunaUsage';
import { PLAN_DISPLAY_LABELS } from '../features/billing/plans';
import { isAutoProviderSelection } from '../lib/lunaProviderSettings';
import { PlansScreen } from './PlansScreen';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  isAnonymous: boolean;
  onResetSession: () => Promise<void>;
}

/** Aba Ajustes — linguagem simples para utilizadores finais. */
export function SettingsScreen({ isAnonymous, onResetSession }: Props) {
  const headerTopPad = useHeaderTopPadding(10);
  const auth = useLunaAuth();
  const lunaProvider = useLunaProvider();
  const billing = useLunaBilling(auth.uid, auth.getIdToken, isAnonymous);
  const usage = useLunaUsage(billing.plan, auth.uid);

  const [resetting, setResetting] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useAndroidBackHandler(
    useCallback(() => {
      if (plansOpen) {
        setPlansOpen(false);
        return true;
      }
      return false;
    }, [plansOpen]),
    plansOpen,
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
          {!isAnonymous && usage.cycle !== 'unlimited' && !usage.loading ? (
            <View style={styles.usageWrap}>
              <UsageMeter usage={usage} />
            </View>
          ) : null}
          <SettingsRow
            icon={apiOnline ? 'wifi-outline' : 'cloud-offline-outline'}
            iconColor={apiOnline ? tokens.online : '#E57373'}
            label="Conexão"
            detail={onlineDetail}
            value={onlineLabel}
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
          {showAdvanced ? (
            <View style={styles.advancedBox}>
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
                    showAllOptions
                    planId={billing.plan}
                  />
                </View>
              )}
              <SettingsRow
                icon="refresh-outline"
                label="Verificar conexão"
                detail="Atualiza o estado da Luna"
                showChevron
                last
                onPress={() => void lunaProvider.refreshFromServer()}
              />
            </View>
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
          <SettingsRow
            icon="options-outline"
            label={showAdvanced ? 'Ocultar opções avançadas' : 'Opções avançadas'}
            detail="Modos de resposta detalhados"
            showChevron
            last
            onPress={() => setShowAdvanced((v) => !v)}
          />
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
        </View>
      </ScrollView>

      <PlansScreen
        visible={plansOpen}
        onClose={() => setPlansOpen(false)}
        planId={billing.plan}
        billing={billing.billing}
        billingOverdue={billing.billingOverdue}
        onTrial={billing.onTrial}
        usage={usage}
        isAnonymous={isAnonymous}
        getIdToken={auth.getIdToken}
        onRefreshAccount={billing.refreshAccount}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 20, paddingBottom: 36 },
  embeddedPicker: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  usageWrap: { paddingHorizontal: 14, paddingBottom: 12 },
  advancedBox: { paddingBottom: 4 },
  loader: { paddingVertical: 16 },
  about: { marginTop: 28, alignItems: 'center' },
  aboutText: { color: tokens.textLow, fontSize: 12, fontWeight: '500' },
});
