import { ASAAS_API_BASE, ASAAS_API_KEY, isAsaasConfigured } from "./asaasConfig.js";
import { getPlanCatalog } from "./planMapping.js";

export class AsaasError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function headers(): Record<string, string> {
  return {
    access_token: ASAAS_API_KEY,
    "Content-Type": "application/json",
    "User-Agent": "Luna-Mobile-API/1.0",
  };
}

async function request<T>(
  method: string,
  path: string,
  jsonBody?: Record<string, unknown>,
): Promise<T> {
  if (!isAsaasConfigured()) throw new AsaasError("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${ASAAS_API_BASE}${path}`, {
    method,
    headers: headers(),
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  if (!res.ok) {
    const errObj = data as { errors?: Array<{ description?: string }> };
    const detail = errObj.errors?.[0]?.description ?? res.statusText;
    throw new AsaasError(String(detail || res.statusText), res.status);
  }
  return data as T;
}

export function normalizeCpfCnpj(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

export async function findCustomerByEmail(email: string): Promise<Record<string, unknown> | null> {
  const data = await request<{ data?: Record<string, unknown>[] }>(
    "GET",
    `/customers?email=${encodeURIComponent(email)}&limit=1`,
  );
  return data.data?.[0] ?? null;
}

async function createCustomer(input: {
  name: string;
  email: string;
  externalReference: string;
  cpfCnpj: string;
}): Promise<Record<string, unknown>> {
  return request("POST", "/customers", {
    name: input.name || input.email,
    email: input.email,
    cpfCnpj: input.cpfCnpj,
    externalReference: input.externalReference,
    notificationDisabled: false,
  });
}

async function ensureCustomerCpf(
  customer: Record<string, unknown>,
  cpfCnpj: string,
): Promise<Record<string, unknown>> {
  const existing = normalizeCpfCnpj(String(customer.cpfCnpj ?? ""));
  if (existing) return customer;
  const customerId = String(customer.id ?? "");
  if (!customerId) throw new AsaasError("Cliente Asaas sem id.");
  return request("PUT", `/customers/${customerId}`, { cpfCnpj });
}

async function findOrCreateCustomer(input: {
  uid: string;
  email: string;
  name: string | null;
  cpfCnpj: string;
}): Promise<Record<string, unknown>> {
  const existing = await findCustomerByEmail(input.email);
  if (existing) return ensureCustomerCpf(existing, input.cpfCnpj);
  return createCustomer({
    name: input.name || input.email.split("@")[0] || input.email,
    email: input.email,
    externalReference: input.uid,
    cpfCnpj: input.cpfCnpj,
  });
}

function nextDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function resolveSubscriptionPaymentUrl(subscriptionId: string): Promise<string | null> {
  if (!subscriptionId) return null;
  const data = await request<{ data?: Record<string, unknown>[] }>(
    "GET",
    `/subscriptions/${subscriptionId}/payments?limit=1`,
  );
  const payment = data.data?.[0];
  if (!payment) return null;
  for (const key of ["invoiceUrl", "bankSlipUrl", "transactionReceiptUrl"]) {
    const url = payment[key];
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

export async function createSubscriptionCheckout(input: {
  uid: string;
  email: string;
  name: string | null;
  planId: string;
  period: string;
  cpfCnpj: string;
}): Promise<Record<string, unknown>> {
  const catalog = getPlanCatalog(input.planId, input.period);
  if (!catalog) throw new AsaasError(`Plano inválido: ${input.planId}/${input.period}`);

  const doc = normalizeCpfCnpj(input.cpfCnpj);
  if (!doc) throw new AsaasError("CPF ou CNPJ inválido.");

  const customer = await findOrCreateCustomer({ ...input, cpfCnpj: doc });
  const customerId = String(customer.id ?? "");
  if (!customerId) throw new AsaasError("Cliente Asaas sem id.");

  const externalRef = `luna:${input.uid}:${input.planId}:${input.period === "annual" ? "annual" : "monthly"}`;
  const subscription = await request<Record<string, unknown>>("POST", "/subscriptions", {
    customer: customerId,
    billingType: "UNDEFINED",
    value: catalog.value,
    nextDueDate: nextDueDate(),
    cycle: catalog.cycle,
    description: catalog.label,
    externalReference: externalRef,
  });

  const subId = String(subscription.id ?? "");
  const invoiceUrl = await resolveSubscriptionPaymentUrl(subId);
  return {
    customerId,
    subscriptionId: subId,
    invoiceUrl,
    externalReference: externalRef,
    value: catalog.value,
    cycle: catalog.cycle,
  };
}

export const CREDIT_PACK_VALUE = 9;

export async function createCreditPackCheckout(input: {
  uid: string;
  email: string;
  name: string | null;
  cpfCnpj: string;
}): Promise<Record<string, unknown>> {
  const doc = normalizeCpfCnpj(input.cpfCnpj);
  if (!doc) throw new AsaasError("CPF ou CNPJ inválido.");

  const customer = await findOrCreateCustomer({ ...input, cpfCnpj: doc });
  const customerId = String(customer.id ?? "");
  if (!customerId) throw new AsaasError("Cliente Asaas sem id.");

  const externalRef = `luna:${input.uid}:credit_pack`;
  const payment = await request<Record<string, unknown>>("POST", "/payments", {
    customer: customerId,
    billingType: "UNDEFINED",
    value: CREDIT_PACK_VALUE,
    dueDate: nextDueDate(),
    description: "Luna Pack +500 créditos",
    externalReference: externalRef,
  });

  let invoiceUrl: string | null = null;
  for (const key of ["invoiceUrl", "bankSlipUrl", "transactionReceiptUrl"]) {
    const url = payment[key];
    if (typeof url === "string" && url.trim()) {
      invoiceUrl = url.trim();
      break;
    }
  }

  return {
    customerId,
    paymentId: payment.id,
    invoiceUrl,
    externalReference: externalRef,
    value: CREDIT_PACK_VALUE,
  };
}

export async function getCustomer(customerId: string): Promise<Record<string, unknown> | null> {
  if (!customerId) return null;
  try {
    return await request("GET", `/customers/${customerId}`);
  } catch {
    return null;
  }
}

export async function getSubscription(subscriptionId: string): Promise<Record<string, unknown> | null> {
  if (!subscriptionId) return null;
  try {
    return await request("GET", `/subscriptions/${subscriptionId}`);
  } catch {
    return null;
  }
}

export async function getPayment(paymentId: string): Promise<Record<string, unknown> | null> {
  if (!paymentId) return null;
  try {
    return await request("GET", `/payments/${paymentId}`);
  } catch {
    return null;
  }
}

export async function listRecentPayments(input: {
  status?: string;
  customerId?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const params = [`limit=${input.limit ?? 20}`];
  if (input.status) params.push(`status=${input.status}`);
  if (input.customerId) params.push(`customer=${input.customerId}`);
  const data = await request<{ data?: Record<string, unknown>[] }>(
    "GET",
    `/payments?${params.join("&")}`,
  );
  return data.data ?? [];
}
