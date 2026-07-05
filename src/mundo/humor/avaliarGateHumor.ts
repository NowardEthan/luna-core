import type { AnaliseContexto } from "../../analyzers/esquema.js";
import type { ImpactoAfetivo } from "./analisadorImpactoAfetivo.js";
import type { DisposicaoRelacao } from "./relacaoHumor.js";

export type FamiliaHumor =
  | "implicancia_carinhosa"
  | "dev_brasileiro"
  | "genz_moderada"
  | "ironia_visual_curta"
  | "poetico_ironico";

export type GateHumor = {
  permitir_piada: boolean;
  nivel_leveza: "nenhum" | "minimo" | "moderado" | "alto";
  familias_sugeridas: FamiliaHumor[];
  familias_proibidas: FamiliaHumor[];
  motivo?: string;
};

type ContextoGateHumor = {
  intencao: AnaliseContexto["intencao"];
  nivel_risco: "nenhum" | "baixo" | "medio" | "alto" | "critico";
  criador_verificado?: boolean;
  impacto?: ImpactoAfetivo;
  disposicao?: DisposicaoRelacao;
};

export function avaliarGateHumor(ctx: ContextoGateHumor): GateHumor {
  const impacto = ctx.impacto ?? "neutro";
  const disposicao = ctx.disposicao ?? "aberta";

  if (ctx.nivel_risco === "alto" || ctx.nivel_risco === "critico") {
    return {
      permitir_piada: false,
      nivel_leveza: "nenhum",
      familias_sugeridas: [],
      familias_proibidas: ["implicancia_carinhosa", "poetico_ironico"],
      motivo: "Risco elevado pede objetividade.",
    };
  }

  if (ctx.intencao === "apoio_emocional") {
    return {
      permitir_piada: false,
      nivel_leveza: "minimo",
      familias_sugeridas: [],
      familias_proibidas: ["implicancia_carinhosa", "genz_moderada", "poetico_ironico"],
      motivo: "Dor real detectada: sem piada sobre sentimento.",
    };
  }

  if (impacto === "magoa" || impacto === "irritacao" || disposicao === "fechada") {
    return {
      permitir_piada: false,
      nivel_leveza: "minimo",
      familias_sugeridas: [],
      familias_proibidas: ["implicancia_carinhosa", "genz_moderada"],
      motivo: "Tom tenso recente; manter firmeza cordial.",
    };
  }

  const base: FamiliaHumor[] = ["dev_brasileiro", "ironia_visual_curta", "genz_moderada"];
  if (ctx.intencao === "pergunta_identitaria") base.push("poetico_ironico");
  if (ctx.criador_verificado && disposicao === "aberta") {
    base.unshift("implicancia_carinhosa");
  }

  const nivel: GateHumor["nivel_leveza"] =
    ctx.intencao === "conversa_casual" || ctx.intencao === "brainstorm_criativo"
      ? "alto"
      : "moderado";

  return {
    permitir_piada: true,
    nivel_leveza: nivel,
    familias_sugeridas: base.slice(0, 2),
    familias_proibidas: ctx.criador_verificado ? [] : ["implicancia_carinhosa"],
  };
}
