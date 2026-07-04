import Constants from 'expo-constants';

export type LunaFirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  appId: string;
  messagingSenderId?: string;
};

type FirebaseExtra = {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseAppId?: string;
  firebaseMessagingSenderId?: string;
};

function extra(): FirebaseExtra {
  return (Constants.expoConfig?.extra ?? {}) as FirebaseExtra;
}

function env(name: string): string {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export function readFirebasePublicConfig(): LunaFirebasePublicConfig | null {
  const ex = extra();
  const apiKey = env('EXPO_PUBLIC_FIREBASE_API_KEY') || ex.firebaseApiKey?.trim() || '';
  const projectId = env('EXPO_PUBLIC_FIREBASE_PROJECT_ID') || ex.firebaseProjectId?.trim() || '';
  const appId = env('EXPO_PUBLIC_FIREBASE_APP_ID') || ex.firebaseAppId?.trim() || '';

  if (!apiKey || !projectId || !appId) return null;

  const authDomain =
    env('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ||
    ex.firebaseAuthDomain?.trim() ||
    `${projectId}.firebaseapp.com`;
  const storageBucket =
    env('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ||
    ex.firebaseStorageBucket?.trim() ||
    `${projectId}.appspot.com`;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    appId,
    messagingSenderId:
      env('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ||
      ex.firebaseMessagingSenderId?.trim() ||
      undefined,
  };
}

export function isFirebaseConfigured(): boolean {
  return readFirebasePublicConfig() !== null;
}
