import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RedoUserChoice } from '../lib/messageActions';
import { MessageActionPreview } from './MessageActionPreview';
import { tokens } from '../theme/tokens';

interface Props {
  visible: boolean;
  choice: RedoUserChoice | null;
  onBranch: () => void;
  onTruncate: () => void;
  onCancel: () => void;
}

/** Escolha ramificar vs apagar — alinhado com MessageRedoChoice do concept. */
export function MessageRedoChoiceSheet({
  visible,
  choice,
  onBranch,
  onTruncate,
  onCancel,
}: Props) {
  if (!choice) return null;

  const { message, tailCount } = choice;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialogWrap} onPress={(e) => e.stopPropagation()}>
          <View style={styles.dialog}>
            <Text style={styles.eyebrow}>Refazer mensagem</Text>
            <Text style={styles.title}>
              Há {tailCount} {tailCount === 1 ? 'mensagem' : 'mensagens'} depois deste ponto
            </Text>
            <MessageActionPreview message={message} />
            <Text style={styles.lead}>
              Ramifique e guarde o ramo anterior, ou apague tudo a partir daqui e recomece com esta
              mensagem.
            </Text>

            <Pressable onPress={onBranch} style={({ pressed }) => [styles.option, styles.primary, pressed && styles.pressed]}>
              <Text style={styles.optionTitle}>Ramificar daqui</Text>
              <Text style={styles.optionDesc}>
                Arquiva o ramo atual ({tailCount + 1} mensagens incluindo esta) num bloco
                expansível acima. Você pode rever o caminho antigo a qualquer momento.
              </Text>
            </Pressable>

            <Pressable onPress={onTruncate} style={({ pressed }) => [styles.option, styles.danger, pressed && styles.pressed]}>
              <Text style={styles.optionTitle}>Apagar e refazer</Text>
              <Text style={styles.optionDesc}>
                Remove esta mensagem e tudo que veio depois. O texto volta ao composer para
                editar.
              </Text>
            </Pressable>

            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 12, 0.82)',
    justifyContent: 'center',
    padding: 20,
  },
  dialogWrap: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  dialog: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: tokens.shell,
  },
  eyebrow: {
    color: tokens.textLow,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.textHigh,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: -0.3,
  },
  quote: {
    color: tokens.textMid,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 20,
  },
  lead: {
    color: tokens.textMid,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    marginBottom: 14,
  },
  option: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  primary: {
    borderColor: 'rgba(99, 140, 255, 0.35)',
    backgroundColor: 'rgba(99, 140, 255, 0.1)',
  },
  danger: {
    borderColor: 'rgba(255, 99, 99, 0.25)',
    backgroundColor: 'rgba(255, 80, 80, 0.08)',
  },
  pressed: { opacity: 0.85 },
  optionTitle: { color: tokens.textHigh, fontSize: 15, fontWeight: '600' },
  optionDesc: { color: tokens.textMid, fontSize: 12, lineHeight: 17, marginTop: 4 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: tokens.textMid, fontSize: 15 },
});
