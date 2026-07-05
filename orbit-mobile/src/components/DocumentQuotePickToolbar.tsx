import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../theme/tokens';

interface Props {
  fileName: string;
  selectedText: string;
  fullText: string;
  canConfirmSelection: boolean;
  onFocusNative?: () => void;
  onConfirm: (excerpt: string) => void;
  onCancel: () => void;
}

export const DocumentQuotePickToolbar = memo(function DocumentQuotePickToolbar({
  fileName,
  selectedText,
  fullText,
  canConfirmSelection,
  onFocusNative,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={16} color="rgba(255, 193, 120, 0.95)" />
        <Text style={styles.headerText} numberOfLines={1}>
          {fileName}
        </Text>
      </View>

      {selectedText ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Trecho selecionado</Text>
          <Text style={styles.previewText} numberOfLines={3}>
            "{selectedText}"
          </Text>
        </View>
      ) : (
        <Text style={styles.emptyHint}>Segure no texto do documento para aparecerem os marcadores.</Text>
      )}

      {onFocusNative ? (
        <Pressable
          onPress={onFocusNative}
          style={({ pressed }) => [styles.focusBtn, pressed && styles.pressed]}
        >
          <Ionicons name="text-outline" size={16} color="rgba(255, 193, 120, 0.95)" />
          <Text style={styles.focusBtnText}>Focar texto para selecionar</Text>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => onConfirm(fullText.trim())}
          disabled={!fullText.trim()}
          style={({ pressed }) => [
            styles.btn,
            styles.btnSecondary,
            !fullText.trim() && styles.btnDisabled,
            pressed && fullText.trim() && styles.pressed,
          ]}
        >
          <Text style={styles.btnSecondaryText}>Documento inteiro</Text>
        </Pressable>

        <Pressable
          onPress={() => onConfirm(selectedText.trim())}
          disabled={!canConfirmSelection}
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            !canConfirmSelection && styles.btnDisabled,
            pressed && canConfirmSelection && styles.pressed,
          ]}
        >
          <Text style={styles.btnPrimaryText}>Usar trecho</Text>
        </Pressable>

        <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: 'rgba(255, 193, 120, 0.35)',
    backgroundColor: 'rgba(12, 16, 26, 0.98)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1, color: tokens.textHigh, fontSize: 14, fontWeight: '600' },
  emptyHint: { color: tokens.textLow, fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  preview: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 193, 120, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 193, 120, 0.25)',
  },
  previewLabel: {
    color: tokens.textLow,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewText: {
    color: tokens.textHigh,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 3,
    lineHeight: 18,
  },
  focusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 193, 120, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 193, 120, 0.3)',
  },
  focusBtnText: { color: 'rgba(255, 193, 120, 0.95)', fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 11 },
  btnPrimary: { backgroundColor: 'rgba(255, 193, 120, 0.88)' },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  btnPrimaryText: { color: '#1a1208', fontSize: 14, fontWeight: '700' },
  btnSecondaryText: { color: tokens.textHigh, fontSize: 13, fontWeight: '500' },
  cancelBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  cancelText: { color: tokens.textMid, fontSize: 14 },
});
