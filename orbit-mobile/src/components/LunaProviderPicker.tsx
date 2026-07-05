import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  type LunaProviderOption,
  type LunaProviderSelection,
  isAutoProviderSelection,
  providerOptionLabel,
} from '../lib/lunaProviderSettings';
import { isGlm47Provider, isPremiumModelAllowed } from '../features/billing/planModelPolicy';
import {
  AUTO_BRAND_DESCRIPTION_FREE,
  lunaModelBrand,
} from '../lib/modelBrands';
import type { LunaPlanId } from '../features/billing/types';
import { tokens } from '../theme/tokens';

interface Props {
  options: LunaProviderOption[];
  selection: LunaProviderSelection;
  onSelect: (next: LunaProviderSelection) => void;
  disabled?: boolean;
  apiReachable?: boolean;
  /** Mostra só Automático + Rápida + Completa (modo utilizador). */
  compact?: boolean;
  /** Mostra todas as opções do servidor (modo avançado). */
  showAllOptions?: boolean;
  /** Plano actual — oculta Core no Grátis. */
  planId?: LunaPlanId;
}

const COMPACT_KEYS = new Set(['auto-auto', 'groq-default', 'cerebras-glm-47']);

function optionKey(opt: LunaProviderOption): string {
  return `${opt.providerId}-${opt.modelKey}`;
}

function friendlyDescription(opt: LunaProviderOption, planLocked?: boolean): string {
  const brand = lunaModelBrand(opt.providerId, opt.modelKey);
  if (opt.modelKey === 'auto' && planLocked) {
    return AUTO_BRAND_DESCRIPTION_FREE;
  }
  return brand.description;
}

function friendlyLabel(opt: LunaProviderOption): string {
  return lunaModelBrand(opt.providerId, opt.modelKey).name;
}

/** Seletor de modo de resposta — copy orientada ao utilizador. */
export function LunaProviderPicker({
  options,
  selection,
  onSelect,
  disabled,
  apiReachable = true,
  compact = false,
  showAllOptions = false,
  planId = 'free',
}: Props) {
  if (!apiReachable) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={20} color={tokens.textMid} />
        <Text style={styles.emptyText}>
          Não foi possível falar com a Luna. Verifique sua conexão com a internet.
        </Text>
      </View>
    );
  }

  if (options.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle-outline" size={20} color="#E57373" />
        <Text style={styles.emptyText}>
          A Luna está temporariamente indisponível. Tente novamente dentro de momentos.
        </Text>
      </View>
    );
  }

  const freePlan = !isPremiumModelAllowed(planId);

  const visible = showAllOptions
    ? options
    : compact
      ? options.filter((o) => {
          if (freePlan && isGlm47Provider(o.providerId, o.modelKey)) return false;
          return COMPACT_KEYS.has(optionKey(o));
        })
      : options;

  const list = visible.length > 0 ? visible : options.filter((o) => o.modelKey === 'auto' || o.modelKey === 'default');

  return (
    <View style={styles.list}>
      {list.map((opt) => {
        const active =
          opt.providerId === selection.providerId && opt.modelKey === selection.modelKey;
        const label = showAllOptions ? lunaModelBrand(opt.providerId, opt.modelKey).fullName : friendlyLabel(opt);
        const description = showAllOptions ? opt.description : friendlyDescription(opt, freePlan);

        return (
          <Pressable
            key={optionKey(opt)}
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
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
              <Text style={styles.description}>{description}</Text>
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
      {!showAllOptions ? (
        <Text style={styles.hint}>
          {isAutoProviderSelection(selection)
            ? lunaModelBrand('auto', 'auto').tagline
            : `Modo activo: ${providerOptionLabel(selection, options)}.`}
        </Text>
      ) : null}
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
