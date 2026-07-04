import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Insets fiáveis — no Android edge-to-edge o StatusBar.currentHeight pode ser 0. */
export function useLayoutInsets() {
  const insets = useSafeAreaInsets();
  const statusFallback =
    Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 28) : 0;
  const top = Math.max(insets.top, statusFallback);
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 0 : insets.bottom);
  return { top, bottom, left: insets.left, right: insets.right };
}

/** Padding superior padrão para headers (status bar + respiro). */
export function useHeaderTopPadding(extra = 6): number {
  const { top } = useLayoutInsets();
  return top + extra;
}
