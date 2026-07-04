import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, KeyboardEvent, Platform } from 'react-native';

/** Margem extra no Android (barra IME / gestos). */
const ANDROID_BUFFER = 12;

export function keyboardInsetFromEvent(e: KeyboardEvent): number {
  const { height, screenY } = e.endCoordinates;

  if (Platform.OS === 'ios') {
    return height;
  }

  // No Android/Expo Go, height sozinho costuma ser curto — usa screenY também
  const windowHeight = Dimensions.get('window').height;
  const fromScreenY = windowHeight - screenY + ANDROID_BUFFER;
  return Math.max(height + ANDROID_BUFFER, fromScreenY);
}

/** Inset inferior quando o teclado está aberto (0 = fechado). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setHeight(keyboardInsetFromEvent(e));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/** Altura reservada para o dock do composer (px) — pill ~56 + padding. */
export const COMPOSER_DOCK_HEIGHT = 80;
export const HOME_DOCK_HEIGHT = 210;
