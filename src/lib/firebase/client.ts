import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
// @ts-expect-error getReactNativePersistence — export RN; tipos publicados são do browser
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

import { isFirebaseConfigured, readFirebasePublicConfig } from './config';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;

function toFirebaseOptions(cfg: NonNullable<ReturnType<typeof readFirebasePublicConfig>>): FirebaseOptions {
  return {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    messagingSenderId: cfg.messagingSenderId,
  };
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (appInstance) return appInstance;

  const cfg = readFirebasePublicConfig();
  if (!cfg) return null;

  appInstance = getApps().length > 0 ? getApp() : initializeApp(toFirebaseOptions(cfg));
  return appInstance;
}

export function getLunaAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  if (authInstance) return authInstance;

  const app = getFirebaseApp();
  if (!app) return null;

  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    authInstance = getAuth(app);
  }
  return authInstance;
}

export function getLunaFirestore(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (firestoreInstance) return firestoreInstance;

  try {
    // RN: WebChannel + fetch streams devolve string em vez de Blob → "Invalid response for blob".
    firestoreInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // @ts-expect-error opção interna do SDK — desactiva fetch streams no RN
      useFetchStreams: false,
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }

  return firestoreInstance;
}
