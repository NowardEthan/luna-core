import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderTopPadding } from '../hooks/useLayoutInsets';
import { Glass } from '../components/Glass';
import { LunaProviderPicker } from '../components/LunaProviderPicker';
import { getLunaApiUrl } from '../config/lunaApi';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useLunaProvider } from '../hooks/LunaProviderContext';
import { isAutoProviderSelection } from '../lib/lunaProviderSettings';
import { isFirebaseConfigured } from '../lib/firebase/config';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  displayName: string;
  initials: string;
  email: string | null;
  photoURL: string | null;
  uid: string | null;
  isAnonymous: boolean;
  authError: string | null;
  onResetSession: () => Promise<void>;
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
}) {
  const color = ok === null ? tokens.textMid : ok ? tokens.online : '#E57373';
  const icon =
    ok === null ? 'ellipse-outline' : ok ? 'checkmark-circle' : 'alert-circle';

  return (
    <Glass radius={14} style={styles.statusRow}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.statusCol}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusDetail}>{detail}</Text>
      </View>
    </Glass>
  );
}

export function AccountScreen({
  displayName,
  initials,
  email,
  photoURL,
  uid,
  isAnonymous,
  authError,
  onResetSession,
}: Props) {
  const headerTopPad = useHeaderTopPadding(10);
  const google = useGoogleSignIn();
  const lunaProvider = useLunaProvider();
  const [resetting, setResetting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const shortUid = uid ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : '—';
  const apiUrl = getLunaApiUrl();
  const health = lunaProvider.health;
  const apiOnline = health?.ok === true && health.coreReady === true;
  const statusLoading = !lunaProvider.loaded || lunaProvider.refreshing;
  const combinedError = authError || google.error || googleError;

  const handleGoogle = () => {
    setGoogleError(null);
    void google.signInWithGoogle().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erro ao entrar com Google.';
      if (message !== 'Login cancelado.') setGoogleError(message);
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingTop: headerTopPad }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={type.displayName}>Conta</Text>
      <Text style={type.tagline}>Perfil e ligações cloud</Text>

      <Glass radius={20} style={styles.profileCard}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarWrap}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}
        <View style={styles.profileCol}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileMeta}>
            {isAnonymous ? 'Sessão anônima' : 'Conta Google'} · Plano free
          </Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
          <Text style={styles.uid}>ID {shortUid}</Text>
        </View>
      </Glass>

      {combinedError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{combinedError}</Text>
        </View>
      ) : null}

      {isAnonymous ? (
        <>
          <Pressable
            disabled={google.busy || !google.ready}
            onPress={handleGoogle}
            style={({ pressed }) => [styles.googleBtn, pressed && styles.pressed]}
          >
            {google.busy ? (
              <ActivityIndicator color={tokens.textHigh} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={tokens.textHigh} />
                <Text style={styles.googleBtnText}>Continuar com Google</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.linkHint}>
            Vincule a conta anônima à sua Google — as conversas desta sessão serão mantidas.
          </Text>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Modelo da Luna</Text>
      <LunaProviderPicker
        options={lunaProvider.options}
        selection={lunaProvider.selection}
        onSelect={(next) => void lunaProvider.setProvider(next)}
        disabled={statusLoading}
        apiReachable={lunaProvider.apiReachable}
        legacyApi={lunaProvider.legacyApi}
      />
      {isAutoProviderSelection(lunaProvider.selection) && lunaProvider.lastRouting ? (
        <Text style={styles.routingHint}>Última escolha: {lunaProvider.lastRouting}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Estado</Text>

      {statusLoading ? (
        <ActivityIndicator color={tokens.accent} style={styles.loader} />
      ) : (
        <>
          <StatusRow
            label="Luna API"
            ok={apiOnline}
            detail={
              apiOnline
                ? `Online · ${apiUrl.replace(/^https?:\/\//, '')}`
                : `Offline · ${apiUrl.replace(/^https?:\/\//, '')}`
            }
          />
          <StatusRow
            label="Firebase"
            ok={isFirebaseConfigured() ? true : null}
            detail={
              isFirebaseConfigured()
                ? isAnonymous
                  ? 'Sync ativo · sessão anônima'
                  : 'Sync ativo · conta Google'
                : 'Não configurado'
            }
          />
          {health ? (
            <StatusRow
              label="Serviços"
              ok={health.llmConfigured === true}
              detail={[
                health.llmConfigured ? 'LLM ✓' : 'LLM ✗',
                health.sttConfigured ? 'STT ✓' : 'STT ✗',
                health.firebaseConfigured ? 'Firestore ✓' : 'Firestore ✗',
              ].join(' · ')}
            />
          ) : null}
        </>
      )}

      <Pressable
        onPress={() => void lunaProvider.refreshFromServer()}
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
      >
        <Ionicons name="refresh" size={18} color={tokens.textMid} />
        <Text style={styles.secondaryBtnText}>Atualizar estado</Text>
      </Pressable>

      <Pressable
        disabled={resetting}
        onPress={() => {
          setResetting(true);
          void onResetSession().finally(() => setResetting(false));
        }}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
      >
        {resetting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {isAnonymous ? 'Nova sessão anônima' : 'Sair e nova sessão anônima'}
            </Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 22, paddingBottom: 32 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginTop: 20,
    gap: 14,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  initials: { color: tokens.accentBright, fontSize: 20, fontWeight: '700' },
  profileCol: { flex: 1, gap: 2 },
  profileName: { color: tokens.textHigh, fontSize: 17, fontWeight: '600' },
  profileMeta: { color: tokens.textMid, fontSize: 13 },
  email: { color: tokens.textMid, fontSize: 13, marginTop: 2 },
  uid: {
    color: tokens.textLow,
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  googleBtnText: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  linkHint: {
    color: tokens.textLow,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
  },
  routingHint: {
    color: tokens.textMid,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  sectionTitle: {
    color: tokens.textMid,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    marginBottom: 8,
  },
  statusCol: { flex: 1, gap: 2 },
  statusLabel: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  statusDetail: { color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  loader: { marginVertical: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: { color: tokens.textMid, fontSize: 14, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: tokens.accent,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.88 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(229,115,115,0.12)',
  },
  errorText: { color: '#E57373', fontSize: 13 },
});
