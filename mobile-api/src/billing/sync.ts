import {
  findCustomerByEmail,
  getPayment,
  getSubscription,
  listRecentPayments,
} from "./asaasClient.js";
import { isLunaBillingCharge } from "./planMapping.js";
import { handleAsaasWebhook } from "./webhookHandler.js";

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

function eventForPaidStatus(status: string): string {
  return status === "CONFIRMED" ? "PAYMENT_CONFIRMED" : "PAYMENT_RECEIVED";
}

async function syncPayment(payment: Record<string, unknown>): Promise<Record<string, unknown>> {
  const status = String(payment.status ?? "").toUpperCase();
  const event = eventForPaidStatus(status);
  const subId = String(payment.subscription ?? "");
  const subscription = subId ? await getSubscription(subId) : null;
  const body: Record<string, unknown> = { event, payment };
  if (subscription) body.subscription = subscription;
  return handleAsaasWebhook(body);
}

export async function syncUserBillingFromAsaas(
  uid: string,
  email: string,
): Promise<Record<string, unknown>> {
  void uid;
  const customer = await findCustomerByEmail(email);
  if (!customer) return { ok: false, error: "Cliente Asaas não encontrado para este email." };

  const customerId = String(customer.id ?? "");
  const payments = await listRecentPayments({ customerId, limit: 30 });
  const paid = payments.filter((p) => PAID_STATUSES.has(String(p.status ?? "").toUpperCase()));
  if (!paid.length) return { ok: false, error: "Nenhuma cobrança paga encontrada no Asaas." };

  let lastResult: Record<string, unknown> | null = null;
  for (const payment of paid) {
    const subId = String(payment.subscription ?? "");
    const subscription = subId ? await getSubscription(subId) : null;
    if (!isLunaBillingCharge(payment, subscription)) continue;
    lastResult = await syncPayment(payment);
    if (lastResult.ok && (lastResult.plan || lastResult.creditPack)) return lastResult;
  }

  return lastResult ?? { ok: false, error: "Não foi possível inferir o plano." };
}

export async function syncPaymentById(paymentId: string): Promise<Record<string, unknown>> {
  const payment = await getPayment(paymentId);
  if (!payment) return { ok: false, error: `Cobrança ${paymentId} não encontrada.` };
  const status = String(payment.status ?? "").toUpperCase();
  if (!PAID_STATUSES.has(status)) {
    return { ok: false, error: `Cobrança com status ${status || "?"} — aguarda RECEIVED/CONFIRMED.` };
  }
  return syncPayment(payment);
}
