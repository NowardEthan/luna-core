import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  formatCpfCnpjDisplay,
  isValidCpfCnpj,
  normalizeCpfCnpj,
  readSavedCpfCnpj,
  saveCpfCnpj,
} from '../../features/billing/cpfCnpj';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useLayoutInsets } from '../../hooks/useLayoutInsets';
import { hapticConfirm, hapticError } from '../../lib/haptics';
import { tokens } from '../../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (digits: string) => void;
}

/** Pedido de CPF/CNPJ antes do checkout Asaas (obrigatório no Brasil). */
export function CpfCnpjSheet({ visible, onClose, onConfirm }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();
  const { bottom: bottomInset } = useLayoutInsets();
  const sheetBottomPad = keyboardHeight > 0 ? keyboardHeight + 6 : Math.max(bottomInset, 24);

  useEffect(() => {
    if (!visible) return;
    void readSavedCpfCnpj().then((saved) => {
      if (saved) setValue(formatCpfCnpjDisplay(saved));
    });
    setError(null);
  }, [visible]);

  const handleChange = (text: string) => {
    const digits = normalizeCpfCnpj(text).slice(0, 14);
    setValue(formatCpfCnpjDisplay(digits));
    setError(null);
  };

  const handleConfirm = async () => {
    const digits = normalizeCpfCnpj(value);
    if (!isValidCpfCnpj(digits)) {
      hapticError();
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }
    hapticConfirm();
    await saveCpfCnpj(digits);
    onConfirm(digits);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.sheet, { paddingBottom: sheetBottomPad }]}>
            <View style={styles.handle} />
          <Text style={styles.title}>Dados para pagamento</Text>
          <Text style={styles.subtitle}>
            Precisamos do seu CPF ou CNPJ para emitir a cobrança com segurança.
          </Text>
          <TextInput
            value={value}
            onChangeText={handleChange}
            placeholder="000.000.000-00"
            placeholderTextColor={tokens.textLow}
            keyboardType="number-pad"
            style={styles.input}
            maxLength={18}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void handleConfirm()}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          >
            <Text style={styles.btnText}>Continuar para pagamento</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetWrap: { width: '100%' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
    backgroundColor: tokens.ink1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.glassBorder,
    marginBottom: 8,
  },
  title: { color: tokens.textHigh, fontSize: 18, fontWeight: '700' },
  subtitle: { color: tokens.textMid, fontSize: 14, lineHeight: 20 },
  input: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: tokens.glassStrong,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: tokens.glassBorder,
    color: tokens.textHigh,
    fontSize: 16,
  },
  error: { color: tokens.error, fontSize: 13 },
  btn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: tokens.accent,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: tokens.textMid, fontSize: 14 },
  pressed: { opacity: 0.88 },
});
