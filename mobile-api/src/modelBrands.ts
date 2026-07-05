/**
 * Nomes de produto dos modos de resposta da Luna (UI — não expõe Groq/Cerebras ao utilizador).
 * Espelho: orbit-mobile/src/lib/modelBrands.ts
 */

export type LunaBrandMode = "orbita" | "clarao" | "profunda";

export type LunaBrandProviderId = "groq" | "cerebras" | "auto";
export type LunaBrandModelKey = "default" | "glm-47" | "auto";

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
  description: "A Luna escolhe Clarão ou Profunda conforme cada mensagem.",
  tagline: "Recomendado para a maioria das conversas.",
};

export const LUNA_BRAND_CLARAO: LunaModelBrand = {
  mode: "clarao",
  name: "Clarão",
  fullName: "Luna Clarão",
  description: "Respostas ágeis — ideal para o dia a dia, follow-ups e perguntas curtas.",
  tagline: "Rápida e directa.",
};

export const LUNA_BRAND_PROFUNDA: LunaModelBrand = {
  mode: "profunda",
  name: "Profunda",
  fullName: "Luna Profunda",
  description: "Raciocínio aprofundado — código, documentos, anexos e temas densos.",
  tagline: "Pensa antes de responder.",
};

const BRAND_BY_KEY: Record<string, LunaModelBrand> = {
  "auto-auto": LUNA_BRAND_ORBITA,
  "groq-default": LUNA_BRAND_CLARAO,
  "cerebras-glm-47": LUNA_BRAND_PROFUNDA,
};

export function lunaModelBrand(
  providerId: LunaBrandProviderId | string,
  modelKey: LunaBrandModelKey | string,
): LunaModelBrand {
  return BRAND_BY_KEY[`${providerId}-${modelKey}`] ?? LUNA_BRAND_CLARAO;
}

export function lunaModelLabel(
  providerId: LunaBrandProviderId | string,
  modelKey: LunaBrandModelKey | string,
  opts?: { full?: boolean },
): string {
  const brand = lunaModelBrand(providerId, modelKey);
  return opts?.full ? brand.fullName : brand.name;
}

export const FREE_PLAN_BRAND_NOTICE = "Plano Grátis — Luna Clarão (Profunda no Plus)";

export const AUTO_BRAND_DESCRIPTION_PREMIUM =
  "Profunda por padrão; Clarão quando a Luna preferir resposta mais rápida.";

export const AUTO_BRAND_DESCRIPTION_FREE =
  "Clarão por padrão no Grátis. Luna Profunda no Plus.";

export const AUTO_ROUTING_BRAND_LABELS = {
  codigo: "Código detectado — Luna Profunda",
  contexto_longo: "Conversa longa — Luna Profunda",
  documento: "Documento ou anexo — Luna Profunda",
  chat_rapido: "Conversa — Luna Profunda",
  fallback_profunda: "Luna Profunda",
  fallback_clarao: "Luna Clarão",
} as const;

export type AutoRoutingBrandReason = keyof typeof AUTO_ROUTING_BRAND_LABELS;
