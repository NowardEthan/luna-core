import { Alert } from 'react-native';

/** Confirmação de apagar conversa inteira. */
export function confirmDeleteConversation(title: string, onConfirm: () => void): void {
  Alert.alert(
    'Apagar conversa',
    `"${title}" vai para a lixeira com todas as mensagens. Você pode restaurar depois.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: onConfirm },
    ],
  );
}

/** Confirmação de restaurar da lixeira. */
export function confirmRestoreConversation(title: string, onConfirm: () => void): void {
  Alert.alert('Restaurar conversa', `Quer restaurar "${title}" na lista de conversas?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Restaurar', onPress: onConfirm },
  ]);
}

/** Apagar permanentemente da lixeira. */
export function confirmPermanentDelete(title: string, onConfirm: () => void): void {
  Alert.alert(
    'Apagar para sempre',
    `"${title}" será removida da lixeira sem possibilidade de restaurar.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar para sempre', style: 'destructive', onPress: onConfirm },
    ],
  );
}
