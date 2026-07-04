import {
  isCreditPackReference,
  isLunaBillingCharge,
  parseExternalReference,
  resolvePlanFromPayment,
  type PlanId,
} from "./planMapping.js";
import {
  findUidByEmail,
  setBillingStatus,
  updateUserPlan,
} from "./planUpdater.js";
import { getCustomer, getSubscription } from "./asaasClient.js";
import { addBonusTurns } from "./usageBonus.js";

const ACTIVATE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);
const DOWNGRADE_EVENTS = new Set([
  "PAYMENT_DELETED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
]);

async function resolveUidFromPayload(
  payment: Record<string, unknown>,
  subscription: Record<string, unknown> | null,
): Promise<string | null> {
  for (const source of [payment, subscription ?? {}]) {
    const ref = parseExternalReference(String(source.externalReference ?? "") || null);
    if (ref?.uid) return ref.uid;
  }

  const customerId = String(
    payment.customer ?? subscription?.customer ?? "",
  );
  if (customerId) {
    const customer = await getCustomer(customerId);
    if (customer) {
      const ref = parseExternalReference(String(customer.externalReference ?? "") || null);
      if (ref?.uid) return ref.uid;
      const email = String(customer.email ?? "");
      const uid = await findUidByEmail(email);
      if (uid) return uid;
    }
  }
  return null;
}

export async function handleAsaasWebhook(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const event = String(body.event ?? "").trim();
  const payment = (body.payment as Record<string, unknown>) ?? {};
  let subscription = (body.subscription as Record<string, unknown> | null) ?? null;

  if (!event) return { ok: false, error: "evento ausente" };

  const subId = String(payment.subscription ?? subscription?.id ?? "");
  if (subId && !subscription) {
    subscription = await getSubscription(subId);
  }

  if (
    ACTIVATE_EVENTS.has(event) ||
    OVERDUE_EVENTS.has(event) ||
    DOWNGRADE_EVENTS.has(event)
  ) {
    if (!isLunaBillingCharge(payment, subscription)) {
      return { ok: true, ignored: true, reason: "not_luna_billing", event };
    }
  }

  const uid = await resolveUidFromPayload(payment, subscription);
  if (!uid) return { ok: false, error: "uid não encontrado", event };

  if (ACTIVATE_EVENTS.has(event)) {
    const extRef = String(payment.externalReference ?? "");
    if (isCreditPackReference(extRef)) {
      const uidPack = parseExternalReference(extRef)?.uid;
      if (uidPack) {
        const result = await addBonusTurns(uidPack);
        return {
          ok: true,
          uid: uidPack,
          event,
          creditPack: true,
          bonusTurns: result.bonusTurns,
        };
      }
    }

    const { planId, period } = resolvePlanFromPayment(payment, subscription);
    if (!planId) return { ok: false, error: "plano não identificado", event };

    await updateUserPlan(uid, planId, {
      status: "active",
      period: period ?? "monthly",
      asaasCustomerId: payment.customer ?? subscription?.customer,
      asaasSubscriptionId: subId || null,
      value: payment.value ?? subscription?.value,
      nextDueDate: subscription?.nextDueDate ?? payment.dueDate,
      lastEvent: event,
    });
    return { ok: true, uid, plan: planId, event };
  }

  if (OVERDUE_EVENTS.has(event)) {
    await setBillingStatus(uid, "overdue", event, {
      asaasSubscriptionId: subId || null,
      nextDueDate: payment.dueDate,
    });
    return { ok: true, uid, status: "overdue", event };
  }

  if (DOWNGRADE_EVENTS.has(event)) {
    await updateUserPlan(uid, "free", {
      status: "cancelled",
      lastEvent: event,
      asaasSubscriptionId: subId || null,
    });
    return { ok: true, uid, plan: "free" as PlanId, event };
  }

  return { ok: true, ignored: true, event };
}
