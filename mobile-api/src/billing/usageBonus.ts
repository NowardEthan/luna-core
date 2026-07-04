import { FieldValue } from "firebase-admin/firestore";

import { requireFirestore } from "./planUpdater.js";

export const CREDIT_PACK_TURNS = 500;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function addBonusTurns(
  uid: string,
  turns = CREDIT_PACK_TURNS,
): Promise<{ ok: true; uid: string; monthKey: string; bonusTurns: number; added: number }> {
  if (turns < 1) throw new Error("turns deve ser positivo");

  const db = requireFirestore();
  const monthKey = currentMonthKey();
  const ref = db.doc(`users/${uid}/usage/${monthKey}`);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current =
      snap.exists && typeof snap.data()?.bonusTurns === "number" ? snap.data()!.bonusTurns : 0;
    const newTotal = current + turns;
    const payload: Record<string, unknown> = {
      bonusTurns: newTotal,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!snap.exists) payload.turns = 0;
    tx.set(ref, payload, { merge: true });
    return newTotal;
  });

  return { ok: true, uid, monthKey, bonusTurns: result, added: turns };
}
