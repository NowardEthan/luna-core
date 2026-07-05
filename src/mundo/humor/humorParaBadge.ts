import type { PerfilExpressaoHumor } from "./humorParaPerfilExpressao.js";

export type HumorBadgeTema =
  | "caloroso"
  | "neutro"
  | "animado"
  | "magoado"
  | "chateado"
  | "contido";

export type HumorBadgePayload = {
  emoji: string;
  label: string;
  tema: HumorBadgeTema;
  narrativa?: string;
  accessibilityLabel: string;
};

export function humorParaBadge(perfil: PerfilExpressaoHumor): HumorBadgePayload {
  let tema: HumorBadgeTema = "neutro";
  let label = "neutra";
  let emoji = "😐";

  if (perfil.disposicao === "fechada") {
    tema = "magoado";
    label = "magoada";
    emoji = "😔";
  } else if (perfil.disposicao === "reticente") {
    tema = "chateado";
    label = "chateada";
    emoji = "😤";
  } else if (perfil.energia === "alta") {
    tema = "animado";
    label = "animada";
    emoji = "😄";
  } else if (perfil.clima === "leve" && (perfil.registro === "caloroso" || perfil.registro === "intimo")) {
    tema = "caloroso";
    label = "bem";
    emoji = "✨";
  } else if (perfil.clima === "contido" || perfil.clima === "pesado") {
    tema = "contido";
    label = "contida";
    emoji = "😌";
  }

  return {
    emoji,
    label,
    tema,
    narrativa: perfil.frase_narrativa,
    accessibilityLabel: `Humor da Luna: ${label}`,
  };
}
