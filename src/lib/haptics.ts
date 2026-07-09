import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const MIN_INTERVAL_MS = 140;
let lastAt = 0;

function canHaptic(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function throttled(fn: () => void) {
  if (!canHaptic()) return;
  const now = Date.now();
  if (now - lastAt < MIN_INTERVAL_MS) return;
  lastAt = now;
  fn();
}

/** Abrir conversa — toque leve imediato. */
export function hapticScreenPush() {
  throttled(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Voltar ao menu. */
export function hapticScreenPop() {
  throttled(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Bolha aterrizando — tick sutil. */
export function hapticBubbleLand() {
  throttled(() => void Haptics.selectionAsync());
}

/** Toque em conversa na lista (prefetch). */
export function hapticListTap() {
  throttled(() => void Haptics.selectionAsync());
}

/** Long-press — seleção / menu contextual. */
export function hapticLongPress() {
  throttled(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Confirmação de ação primária (salvar, enviar, concluir). */
export function hapticConfirm() {
  throttled(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Ação destrutiva (apagar, remover) — aviso antes de agir. */
export function hapticDestructive() {
  throttled(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Falha / entrada inválida. */
export function hapticError() {
  throttled(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Sucesso confirmado pelo backend (pagamento, upload). */
export function hapticSuccess() {
  throttled(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
