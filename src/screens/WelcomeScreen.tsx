import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { tokens } from '../theme/tokens';
import { type } from '../theme/typography';

interface Props {
  onContinueAsGuest: (displayName: string) => Promise<void>;
  authError: string | null;
}

/** Entrada inicial — Google ou perfil anónimo com nome antes de usar o app. */
export const WelcomeScreen = memo(function WelcomeScreen({ onContinueAsGuest, authError }: Props) {
  const insets = useSafeAreaInsets();
  const google = useGoogleSignIn();
  const [name, setName] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canGuest = trimmed.length >= 2 && !guestBusy && !google.busy;

  const handleGuest = async () => {
    if (!canGuest) return;
    setLocalError(null);
    setGuestBusy(true);
    try {
      await onContinueAsGuest(trimmed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Não foi possível continuar.');
    } finally {
      setGuestBusy(false);
    }
  };

  const error = localError || authError || google.error;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={[tokens.accentMid, tokens.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <Text style={styles.logoText}>O</Text>
        </LinearGradient>

        <Text style={styles.title}>Bem-vindo ao Orbit</Text>
        <Text style={styles.subtitle}>
          Converse com a Luna no seu ritmo. Escolha como quer começar — pode conectar o Google depois no
          perfil.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Como podemos te chamar?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Seu nome ou apelido"
            placeholderTextColor={tokens.textLow}
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={48}
            returnKeyType="done"
            onSubmitEditing={() => void handleGuest()}
          />

          <Pressable
            style={[styles.btnPrimary, !canGuest && styles.btnDisabled]}
            disabled={!canGuest}
            onPress={() => void handleGuest()}
            accessibilityRole="button"
            accessibilityLabel="Continuar como convidado"
          >
            {guestBusy ? (
              <ActivityIndicator color={tokens.onAccent} />
            ) : (
              <>
                <Ionicons name="person-outline" size={20} color={tokens.onAccent} />
                <Text style={styles.btnPrimaryText}>Continuar como convidado</Text>
              </>
            )}
          </Pressable>
        </View>

        {google.configured ? (
          <Pressable
            style={[styles.btnGoogle, google.busy && styles.btnDisabled]}
            disabled={google.busy || guestBusy}
            onPress={() => {
              setLocalError(null);
              void google.signInWithGoogle().catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Entrar com Google"
          >
            {google.busy ? (
              <ActivityIndicator color={tokens.textHigh} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={tokens.textHigh} />
                <Text style={styles.btnGoogleText}>Entrar com Google</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1014' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 18 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  logoText: { color: tokens.onAccent, fontSize: 28, fontWeight: '800' },
  title: { ...type.displayName, textAlign: 'center', fontSize: 26 },
  subtitle: { ...type.tagline, textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: { color: tokens.textMid, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    color: tokens.textHigh,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  btnPrimaryText: { color: tokens.onAccent, fontSize: 16, fontWeight: '700' },
  btnGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnGoogleText: { color: tokens.textHigh, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.45 },
  error: { color: '#FFB4AB', textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
