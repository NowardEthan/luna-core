import { getLunaApiUrl } from './lunaApi';

/** URL base para billing — mesma Luna API se não houver override. */
export function getLunaBillingApiUrl(): string {
  const dedicated = process.env.EXPO_PUBLIC_LUNA_BILLING_API_URL?.trim();
  if (dedicated) return dedicated.replace(/\/$/, '');
  return getLunaApiUrl();
}

export function isLunaBillingApiConfigured(): boolean {
  return getLunaBillingApiUrl().length > 0;
}
