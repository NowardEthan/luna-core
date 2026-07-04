import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuth } from "firebase-admin/auth";

import {
  getFirebaseAdminApp,
  isFirebaseAdminConfigured,
  verifyFirebaseBearer,
} from "../firebaseAdmin.js";
import {
  allowUnauthenticatedWebhooks,
  ASAAS_WEBHOOK_TOKEN,
  isAsaasConfigured,
  isWebhookAuthEnabled,
} from "./asaasConfig.js";
import {
  AsaasError,
  createCreditPackCheckout,
  createSubscriptionCheckout,
  normalizeCpfCnpj,
} from "./asaasClient.js";
import { syncTrial } from "./trial.js";
import { syncUserBillingFromAsaas } from "./sync.js";
import { handleAsaasWebhook } from "./webhookHandler.js";

type Json = Record<string, unknown>;

async function readJsonBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Json;
}

async function requireAccountWithEmail(
  authorization: string | undefined,
): Promise<{ uid: string; email: string; name: string | null } | { error: string; status: number }> {
  const auth = await verifyFirebaseBearer(authorization);
  if (!auth) return { error: "Autenticação Firebase obrigatória.", status: 401 };
  if (auth.isAnonymous) {
    return { error: "Conta Google necessária para billing.", status: 401 };
  }
  if (!isFirebaseAdminConfigured()) {
    return { error: "Firebase Admin indisponível.", status: 503 };
  }
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) return { error: "Firebase Admin indisponível.", status: 503 };

  try {
    const user = await getAuth(adminApp).getUser(auth.uid);
    const email = user.email?.trim() ?? "";
    if (!email) {
      return { error: "Conta sem email — necessário para pagamento.", status: 400 };
    }
    return { uid: auth.uid, email, name: user.displayName ?? null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Utilizador não encontrado.",
      status: 400,
    };
  }
}

function verifyWebhookToken(req: IncomingMessage): { ok: true } | { error: string; status: number } {
  if (!isWebhookAuthEnabled()) {
    if (allowUnauthenticatedWebhooks()) return { ok: true };
    return { error: "ASAAS_WEBHOOK_TOKEN não configurado.", status: 503 };
  }
  const token = String(
    req.headers["asaas-access-token"] ?? req.headers["Asaas-Access-Token"] ?? "",
  ).trim();
  if (token !== ASAAS_WEBHOOK_TOKEN) {
    return { error: "Token de webhook inválido.", status: 401 };
  }
  return { ok: true };
}

export async function handleBillingRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  sendJson: (res: ServerResponse, status: number, payload: unknown) => void,
  readAuthHeader: (req: IncomingMessage) => string | undefined,
): Promise<boolean> {
  if (pathname === "/v1/billing/webhook/asaas" && req.method === "POST") {
    const gate = verifyWebhookToken(req);
    if ("error" in gate) {
      sendJson(res, gate.status, { ok: false, error: gate.error });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const result = await handleAsaasWebhook(body);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (req.method !== "POST") return false;

  if (pathname === "/v1/billing/checkout") {
    const account = await requireAccountWithEmail(readAuthHeader(req));
    if ("error" in account) {
      sendJson(res, account.status, { ok: false, error: account.error });
      return true;
    }
    if (!isAsaasConfigured()) {
      sendJson(res, 503, { ok: false, error: "Asaas não configurado no servidor." });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const planId = String(body.planId ?? body.plan_id ?? "").trim();
      let period = String(body.period ?? "monthly").trim().toLowerCase();
      if (period !== "monthly" && period !== "annual") period = "monthly";
      if (planId !== "plus" && planId !== "pro" && planId !== "byok") {
        sendJson(res, 400, { ok: false, error: "Plano inválido para checkout." });
        return true;
      }
      const cpfCnpj = normalizeCpfCnpj(String(body.cpfCnpj ?? body.cpf_cnpj ?? ""));
      if (!cpfCnpj) {
        sendJson(res, 400, { ok: false, error: "Informe CPF ou CNPJ para criar a cobrança." });
        return true;
      }
      const result = await createSubscriptionCheckout({
        uid: account.uid,
        email: account.email,
        name: account.name,
        planId,
        period,
        cpfCnpj,
      });
      const url = result.invoiceUrl;
      if (!url) {
        sendJson(res, 502, {
          ok: false,
          error: "Assinatura criada mas sem link de pagamento — verifica o painel Asaas.",
          subscriptionId: result.subscriptionId,
        });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        url,
        subscriptionId: result.subscriptionId,
        externalReference: result.externalReference,
      });
    } catch (err) {
      const message = err instanceof AsaasError ? err.message : err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/v1/billing/sync") {
    const account = await requireAccountWithEmail(readAuthHeader(req));
    if ("error" in account) {
      sendJson(res, account.status, { ok: false, error: account.error });
      return true;
    }
    if (!isAsaasConfigured()) {
      sendJson(res, 503, { ok: false, error: "Asaas não configurado no servidor." });
      return true;
    }
    try {
      const result = await syncUserBillingFromAsaas(account.uid, account.email);
      sendJson(res, result.ok ? 200 : 400, result);
    } catch (err) {
      const message = err instanceof AsaasError ? err.message : err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/v1/billing/trial/sync") {
    const account = await requireAccountWithEmail(readAuthHeader(req));
    if ("error" in account) {
      sendJson(res, account.status, { ok: false, error: account.error });
      return true;
    }
    try {
      const result = await syncTrial(account.uid);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === "/v1/billing/credit-pack") {
    const account = await requireAccountWithEmail(readAuthHeader(req));
    if ("error" in account) {
      sendJson(res, account.status, { ok: false, error: account.error });
      return true;
    }
    if (!isAsaasConfigured()) {
      sendJson(res, 503, { ok: false, error: "Asaas não configurado no servidor." });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const cpfCnpj = normalizeCpfCnpj(String(body.cpfCnpj ?? body.cpf_cnpj ?? ""));
      if (!cpfCnpj) {
        sendJson(res, 400, { ok: false, error: "Informe CPF ou CNPJ." });
        return true;
      }
      const result = await createCreditPackCheckout({
        uid: account.uid,
        email: account.email,
        name: account.name,
        cpfCnpj,
      });
      const url = result.invoiceUrl;
      if (!url) {
        sendJson(res, 502, { ok: false, error: "Cobrança criada sem link de pagamento." });
        return true;
      }
      sendJson(res, 200, { ok: true, url });
    } catch (err) {
      const message = err instanceof AsaasError ? err.message : err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { ok: false, error: message });
    }
    return true;
  }

  return false;
}

export function isBillingConfigured(): boolean {
  return isAsaasConfigured() && isFirebaseAdminConfigured();
}
