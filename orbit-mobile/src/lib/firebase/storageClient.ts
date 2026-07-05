import { getStorage, type FirebaseStorage } from 'firebase/storage';

import { getFirebaseApp } from './client';
import { isFirebaseConfigured } from './config';

let storageInstance: FirebaseStorage | null = null;

export function getLunaStorage(): FirebaseStorage | null {
  if (!isFirebaseConfigured()) return null;
  if (storageInstance) return storageInstance;

  const app = getFirebaseApp();
  if (!app) return null;

  storageInstance = getStorage(app);
  return storageInstance;
}
