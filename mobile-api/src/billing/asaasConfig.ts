export const ASAAS_API_KEY = process.env.ASAAS_API_KEY?.trim() ?? "";
export const ASAAS_ENV = (process.env.ASAAS_ENV?.trim() || "sandbox").toLowerCase();
export const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "";

export const ASAAS_API_BASE =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

export function isAsaasConfigured(): boolean {
  return ASAAS_API_KEY.length > 0;
}

export function isWebhookAuthEnabled(): boolean {
  return ASAAS_WEBHOOK_TOKEN.length > 0;
}

export function allowUnauthenticatedWebhooks(): boolean {
  const flag = process.env.ASAAS_WEBHOOK_ALLOW_OPEN?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}
