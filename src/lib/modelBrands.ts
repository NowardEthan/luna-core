/**
 * Nomes de produto dos modos de resposta da Luna (UI).
 * Mantém sincronizado com mobile-api/src/modelBrands.ts
 */

export type LunaBrandMode = "orbita" | "pulse" | "core";

export type LunaBrandProviderId = "groq" | "cerebras" | "auto";
export type LunaBrandModelKey = "default" | "glm-47" | "gpt-oss-120b" | "auto";

export type LunaModelBrand = {
  mode: LunaBrandMode;
  name: string;
  fullName: string;
  description: string;
  tagline: string;
};

export const LUNA_BRAND_ORBITA: LunaModelBrand = {
  mode: "orbita",
  name: "Orbita",
  fullName: "Luna Orbita",
  description: "A Luna escolhe Pulse ou Core conforme cada mensagem.",
  tagline: "Recomendado para a maioria das conversas.",
};

export const LUNA_BRAND_PULSE: LunaModelBrand = {
  mode: "pulse",
  name: "Pulse",
  fullName: "Luna Pulse",
  description: "Respostas ágeis — ideal para o dia a dia, follow-ups e perguntas curtas.",
  tagline: "Rápida e directa.",
};

export const LUNA_BRAND_CORE: LunaModelBrand = {
  mode: "core",
  name: "Core",
  fullName: "Luna Core",
  description: "Raciocínio profundo — código, documentos, anexos e temas densos.",
  tagline: "Pensa antes de responder.",
};

export const LUNA_BRAND_CORE_OSS: LunaModelBrand = {
  mode: "core",
  name: "Core OSS",
  fullName: "Luna Core OSS",
  description: "GPT-OSS-120B no Cerebras — forte em código e raciocínio profundo.",
  tagline: "Open-weight, pensamento estruturado.",
};

const BRAND_BY_KEY: Record<string, LunaModelBrand> = {
  "auto-auto": LUNA_BRAND_ORBITA,
  "groq-default": LUNA_BRAND_PULSE,
  "cerebras-glm-47": LUNA_BRAND_CORE,
  "cerebras-gpt-oss-120b": LUNA_BRAND_CORE_OSS,
};

export function lunaModelBrand(
  providerId: LunaBrandProviderId | string,
  modelKey: LunaBrandModelKey | string,
): LunaModelBrand {
  return BRAND_BY_KEY[`${providerId}-${modelKey}`] ?? LUNA_BRAND_PULSE;
}

export function lunaModelLabel(
  providerId: LunaBrandProviderId | string,
  modelKey: LunaBrandModelKey | string,
  opts?: { full?: boolean },
): string {
  const brand = lunaModelBrand(providerId, modelKey);
  return opts?.full ? brand.fullName : brand.name;
}

export const FREE_PLAN_BRAND_NOTICE = "Plano Grátis — Luna Pulse (Core no Plus)";

export const AUTO_BRAND_DESCRIPTION_FREE =
  "Pulse por padrão no Grátis. Luna Core no Plus.";
