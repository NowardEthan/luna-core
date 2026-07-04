import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  type LunaProviderOption,
  type LunaProviderSelection,
  isAutoProviderSelection,
  providerOptionLabel,
} from '../lib/lunaProviderSettings';
import { tokens } from '../theme/tokens';

interface Props {
  options: LunaProviderOption[];
  selection: LunaProviderSelection;
  onSelect: (next: LunaProviderSelection) => void;
  disabled?: boolean;
  apiReachable?: boolean;
  legacyApi?: boolean;
}

/** Seletor de provedor/modelo LLM para o chat mobile. */
export function LunaProviderPicker({
  options,
  selection,
  onSelect,
  disabled,
  apiReachable = true,
  legacyApi = false,
}: Props) {
  if (!apiReachable) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={20} color={tokens.textMid} />
        <Text style={styles.emptyText}>
          Não consegui ligar à Luna API. Verifique EXPO_PUBLIC_LUNA_API_URL e se o servidor está
          online.
        </Text>
      </View>
    );
  }

  if (options.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle-outline" size={20} color="#E57373" />
        <Text style={styles.emptyText}>
          Nenhum LLM configurado no servidor. Adicione LUNA_API_KEY (e opcionalmente
          OPENROUTER_API_KEY) no Railway.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {options.map((opt) => {
        const active =
          opt.providerId === selection.providerId && opt.modelKey === selection.modelKey;
        return (
          <Pressable
            key={`${opt.providerId}-${opt.modelKey}`}
            disabled={disabled}
            onPress={() => onSelect({ providerId: opt.providerId, modelKey: opt.modelKey })}
            style={({ pressed }) => [
              styles.row,
              active && styles.rowActive,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
              <Text style={styles.description}>{opt.description}</Text>
              {opt.modelId !== 'auto' ? <Text style={styles.modelId}>{opt.modelId}</Text> : null}
            </View>
            {active ? (
              <Ionicons
                name={opt.modelKey === 'auto' ? 'sparkles' : 'checkmark-circle'}
                size={22}
                color={tokens.accentBright}
              />
            ) : (
              <Ionicons
                name={opt.modelKey === 'auto' ? 'sparkles-outline' : 'ellipse-outline'}
                size={22}
                color={tokens.textLow}
              />
            )}
          </Pressable>
        );
      })}
      <Text style={styles.hint}>
        {legacyApi
          ? 'Servidor sem multi-provider — só Groq até fazer redeploy da Luna API.'
          : isAutoProviderSelection(selection)
            ? 'Modo automático — a Luna escolhe o modelo ideal para cada mensagem.'
            : `Modelo fixo: ${providerOptionLabel(selection, options)}. Aplica-se às próximas mensagens.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  rowActive: {
    borderColor: tokens.accent,
    backgroundColor: tokens.accentSoft,
  },
  rowMain: { flex: 1, gap: 3 },
  label: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  labelActive: { color: tokens.accentBright },
  description: { color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  modelId: {
    color: tokens.textLow,
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  hint: { color: tokens.textLow, fontSize: 11, lineHeight: 16, marginTop: 4 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: tokens.glassStrong,
  },
  emptyText: { flex: 1, color: tokens.textMid, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
});
