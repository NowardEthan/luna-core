import { requireFirestore, updateUserPlan } from "./planUpdater.js";

const TRIAL_DAYS = 7;

function parseIso(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  let raw = value.trim();
  if (raw.endsWith("Z")) raw = `${raw.slice(0, -1)}+00:00`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function expireTrialIfNeeded(uid: string): Promise<Record<string, unknown>> {
  const db = requireFirestore();
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, skipped: true, reason: "no_profile" };

  const billing = (snap.data()?.billing ?? {}) as Record<string, unknown>;
  if (billing.status !== "trial") return { ok: true, skipped: true, reason: "not_on_trial" };

  const trialEnds = parseIso(String(billing.trialEndsAt ?? ""));
  if (trialEnds && new Date() < trialEnds) {
    return { ok: true, active: true, trialEndsAt: billing.trialEndsAt };
  }

  await updateUserPlan(uid, "free", {
    status: "expired",
    trialEndsAt: billing.trialEndsAt,
    trialUsed: true,
    lastEvent: "TRIAL_EXPIRED",
  });
  return { ok: true, expired: true };
}

export async function startTrialIfEligible(uid: string): Promise<Record<string, unknown>> {
  await expireTrialIfNeeded(uid);

  const db = requireFirestore();
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  const data = snap.data() ?? {};

  const plan = String(data.plan ?? "free");
  const billing = (data.billing ?? {}) as Record<string, unknown>;

  if (billing.trialUsed) return { ok: true, skipped: true, reason: "trial_used" };
  if (billing.asaasSubscriptionId) return { ok: true, skipped: true, reason: "has_subscription" };
  if (billing.status === "active") return { ok: true, skipped: true, reason: "paid_active" };
  if (plan !== "free") return { ok: true, skipped: true, reason: `plan_${plan}` };
  if (billing.status === "trial") {
    return { ok: true, skipped: true, reason: "already_on_trial", trialEndsAt: billing.trialEndsAt };
  }

  const ends = new Date();
  ends.setUTCDate(ends.getUTCDate() + TRIAL_DAYS);

  await updateUserPlan(uid, "pro", {
    status: "trial",
    trialEndsAt: ends.toISOString(),
    trialUsed: true,
    lastEvent: "TRIAL_STARTED",
  });
  return { ok: true, started: true, trialEndsAt: ends.toISOString() };
}

export async function syncTrial(uid: string): Promise<Record<string, unknown>> {
  const expired = await expireTrialIfNeeded(uid);
  if (expired.expired) return expired;
  const started = await startTrialIfEligible(uid);
  if (started.started) return started;
  return expired.active ? expired : started;
}
