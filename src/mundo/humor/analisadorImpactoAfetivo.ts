import type { AnaliseContexto } from "../../analyzers/esquema.js";

export type ImpactoAfetivo = "carinho" | "neutro" | "magoa" | "irritacao" | "desculpas";

export type ResultadoImpactoAfetivo = {
  impacto: ImpactoAfetivo;
  intensidade: number;
  confianca: number;
  origem: "regras";
};

const REGEX_CARINHO =
  /\b(te amo|amo voc[eê]|gosto (muito )?de voc[eê]|obrigad[oa] por estar|você é importante|querid[ao]|meu bem)\b/i;
const REGEX_DESCULPAS = /\b(desculpa|desculpe|perd[aã]o|foi mal)\b/i;
const REGEX_INSULTO =
  /\b(idiot[ao]|burra|burro|in[úu]til|lixo|ot[áa]ri[ao]|est[úu]pid[ao]|babaca|imbecil|arrombado|escrota|escroto)\b/i;
const REGEX_IRRITACAO =
  /\b(chata|chato|que raiva|me irrita|irritante|cala a boca|vai embora|some daqui)\b/i;

export function analisarImpactoAfetivo(
  mensagem: string,
  analise: AnaliseContexto,
): ResultadoImpactoAfetivo {
  const msg = mensagem.trim();
  if (!msg) {
    return { impacto: "neutro", intensidade: 0, confianca: 1, origem: "regras" };
  }

  if (REGEX_DESCULPAS.test(msg)) {
    return { impacto: "desculpas", intensidade: 0.45, confianca: 0.9, origem: "regras" };
  }
  if (REGEX_INSULTO.test(msg)) {
    return { impacto: "magoa", intensidade: 0.85, confianca: 0.95, origem: "regras" };
  }
  if (REGEX_IRRITACAO.test(msg)) {
    return { impacto: "irritacao", intensidade: 0.65, confianca: 0.9, origem: "regras" };
  }
  if (REGEX_CARINHO.test(msg) || analise.intencao === "expressao_afetiva") {
    return { impacto: "carinho", intensidade: 0.55, confianca: 0.8, origem: "regras" };
  }

  return { impacto: "neutro", intensidade: 0, confianca: 0.8, origem: "regras" };
}
