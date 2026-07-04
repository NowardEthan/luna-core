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
