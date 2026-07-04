import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "../firebaseAdmin.js";
import { entitlementsForPlan, isValidPlanId, type PlanId } from "./planMapping.js";

export function requireFirestore() {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firebase Admin indisponível.");
  return db;
}

export async function findUidByEmail(email: string): Promise<string | null> {
  if (!email.includes("@")) return null;
  const db = requireFirestore();
  for (const variant of [email.trim().toLowerCase(), email.trim()]) {
    const snap = await db.collection("users").where("email", "==", variant).limit(1).get();
    if (!snap.empty) return snap.docs[0]!.id;
  }
  return null;
}

export async function updateUserPlan(
  uid: string,
  planId: PlanId,
  billingPatch?: Record<string, unknown>,
): Promise<{ ok: true; uid: string; plan: PlanId }> {
  if (!isValidPlanId(planId)) throw new Error(`Plano inválido: ${planId}`);

  const db = requireFirestore();
  const ref = db.doc(`users/${uid}`);
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    plan: planId,
    entitlements: entitlementsForPlan(planId),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (billingPatch) {
    payload.billing = { ...billingPatch, updatedAt: now };
  }
  await ref.set(payload, { merge: true });
  return { ok: true, uid, plan: planId };
}

export async function setBillingStatus(
  uid: string,
  status: string,
  event: string,
  extra?: Record<string, unknown>,
): Promise<{ ok: true; uid: string; status: string }> {
  const db = requireFirestore();
  const now = new Date().toISOString();
  const billing: Record<string, unknown> = {
    status,
    lastEvent: event,
    lastEventAt: now,
    updatedAt: now,
    ...extra,
  };
  await db.doc(`users/${uid}`).set(
    { billing, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true, uid, status };
}
