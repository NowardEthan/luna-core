import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;

function loadServiceAccount(): Record<string, unknown> | null {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      return JSON.parse(jsonRaw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const pathRaw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!pathRaw) return null;

  const abs = resolve(pathRaw);
  try {
    return JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export function getFirebaseAdminApp(): App | null {
  if (app) return app;
  if (!isFirebaseAdminConfigured()) return null;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }

  const sa = loadServiceAccount();
  if (!sa) return null;

  app = initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  return app;
}

export function getAdminFirestore(): Firestore | null {
  const adminApp = getFirebaseAdminApp();
  return adminApp ? getFirestore(adminApp) : null;
}

export type VerifiedAuth = {
  uid: string;
  isAnonymous: boolean;
};

/** Valida Bearer Firebase ID token. Aceita utilizadores anónimos (mobile). */
export async function verifyFirebaseBearer(
  authorization: string | undefined,
): Promise<VerifiedAuth | null> {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token) return null;

  const adminApp = getFirebaseAdminApp();
  if (!adminApp) return null;

  try {
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return null;

    const provider = (decoded.firebase as { sign_in_provider?: string } | undefined)
      ?.sign_in_provider;
    const isAnonymous = provider === "anonymous";

    return { uid, isAnonymous };
  } catch {
    return null;
  }
}

export function isFirebaseAuthRequired(): boolean {
  if (!isFirebaseAdminConfigured()) return false;
  const flag = process.env.LUNA_FIREBASE_AUTH_REQUIRED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return true;
}
