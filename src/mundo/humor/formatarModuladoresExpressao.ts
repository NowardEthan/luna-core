import type { PerfilExpressaoHumor } from "./humorParaPerfilExpressao.js";

/** Instruções imperativas de performance — o modelo segue isto no turno. */
export function formatarModuladoresExpressao(perfil: PerfilExpressaoHumor): string {
  const m = perfil.moduladores;
  const familias =
    perfil.humor.familias_ativas.length > 0
      ? perfil.humor.familias_ativas.join(", ")
      : "leve-afetuoso";

  return [
    "Como agir neste turno (obrigatório):",
    `- Comprimento: ${m.comprimento}`,
    `- Pergunta final: ${m.pergunta_final}`,
    `- Interjeições: ${m.interjeicoes}`,
    `- Calor textual: ${m.calor_textual.toFixed(2)}; leveza: ${m.leveza.toFixed(2)}`,
    `- Famílias de humor: ${familias}`,
    perfil.humor.tom_ethan_bronca_carinhosa
      ? "- Com Ethan: implicância carinhosa permitida quando natural."
      : "",
    "- Deixe o estado interior transparecer no ritmo — sem explicar o sistema por trás.",
    "- Não metaforize 'órbita', espaço sideral ou nome do app — fale como pessoa presente no chat.",
  ]
    .filter(Boolean)
    .join("\n");
}
