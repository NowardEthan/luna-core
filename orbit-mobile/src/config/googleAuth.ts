import Constants from 'expo-constants';

/** Web Client ID OAuth — Firebase Console → Auth → Google → Web SDK. */
const DEFAULT_WEB_CLIENT_ID = '';

/** `1068126871324-xxx.apps...` → `com.googleusercontent.apps.1068126871324-xxx` (plugin iOS). */
export function webClientIdToIosUrlScheme(webClientId: string): string | null {
  const trimmed = webClientId.trim();
  if (!trimmed.endsWith('.apps.googleusercontent.com')) return null;
  const prefix = trimmed.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${prefix}`;
}

type GoogleExtra = {
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
};

function extra(): GoogleExtra {
  return (Constants.expoConfig?.extra ?? {}) as GoogleExtra;
}

export function getGoogleWebClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
    extra().googleWebClientId?.trim() ||
    DEFAULT_WEB_CLIENT_ID
  );
}

/** Client ID Android (Google Cloud → Credenciais → Android). Obrigatório no celular. */
export function getGoogleAndroidClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
    extra().googleAndroidClientId?.trim() ||
    ''
  );
}

/** Client ID iOS (Google Cloud → Credenciais → iOS). */
export function getGoogleIosClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
    extra().googleIosClientId?.trim() ||
    ''
  );
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleWebClientId().length > 0;
}

/** Nativo: basta Web Client ID + credencial Android (SHA-1) no Google Cloud. */
export function isGoogleNativeClientConfigured(): boolean {
  return isGoogleAuthConfigured();
}
