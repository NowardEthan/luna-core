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
  /** Mostra só os modos de produto que importam para o usuário. */
  compact?: boolean;
  /** Plano atual — oculta Core no Grátis. */
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

function modeIcon(opt: LunaProviderOption): keyof typeof Ionicons.glyphMap {
  if (opt.modelKey === 'auto') return 'sparkles-outline';
  if (opt.providerId === 'groq') return 'flash-outline';
  return 'planet-outline';
}

/** Seletor de modo de resposta — copy orientada ao usuário. */
export function LunaProviderPicker({
  options,
  selection,
  onSelect,
  disabled,
  apiReachable = true,
  compact = false,
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

  const visible = compact
    ? options.filter((o) => {
        if (freePlan && isGlm47Provider(o.providerId, o.modelKey)) return false;
        return COMPACT_KEYS.has(optionKey(o));
      })
    : options;

  const list =
    visible.length > 0
      ? visible
      : options.filter((o) => o.modelKey === 'auto' || o.modelKey === 'default');

  return (
    <View style={styles.list}>
      {list.map((opt, index) => {
        const active =
          opt.providerId === selection.providerId && opt.modelKey === selection.modelKey;
        const label = friendlyLabel(opt);
        const description = friendlyDescription(opt, freePlan);
        const last = index === list.length - 1;

        return (
          <Pressable
            key={optionKey(opt)}
            disabled={disabled}
            onPress={() => onSelect({ providerId: opt.providerId, modelKey: opt.modelKey })}
            style={({ pressed }) => [
              styles.row,
              !last && styles.rowBorder,
              active && styles.rowActive,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <View style={[styles.modeIcon, active && styles.modeIconActive]}>
              <Ionicons
                name={modeIcon(opt)}
                size={18}
                color={active ? tokens.accentBright : tokens.textMid}
              />
            </View>
            <View style={styles.rowMain}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
                {opt.modelKey === 'auto' ? <Text style={styles.meta}>recomendado</Text> : null}
              </View>
              <Text style={styles.description}>{description}</Text>
            </View>
            <Ionicons
              name={active ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={active ? tokens.accentBright : tokens.textLow}
            />
          </Pressable>
        );
      })}
      {compact ? (
        <Text style={styles.hint}>
          {isAutoProviderSelection(selection)
            ? lunaModelBrand('auto', 'auto').tagline
            : `Modo ativo: ${providerOptionLabel(selection, options)}.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 6,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderSubtle,
  },
  rowActive: {
    backgroundColor: tokens.accentSoft,
  },
  rowMain: { flex: 1, gap: 3, minWidth: 0 },
  modeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.surfaceRaised,
  },
  modeIconActive: {
    backgroundColor: 'rgba(136, 193, 242, 0.14)',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  labelActive: { color: tokens.accentBright },
  meta: {
    color: tokens.textLow,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  description: { color: tokens.textMid, fontSize: 12, lineHeight: 17 },
  hint: { color: tokens.textLow, fontSize: 11, lineHeight: 16, marginTop: 8 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  emptyText: { flex: 1, color: tokens.textMid, fontSize: 13, lineHeight: 18 },
  pressed: { backgroundColor: tokens.surfaceRaised },
  disabled: { opacity: 0.55 },
});
