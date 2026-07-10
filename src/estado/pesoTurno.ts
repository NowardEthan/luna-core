import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { ProfundidadeAnalise } from "./talamoPipeline.js";

/**
 * Peso do turno — P1 (Luna Profunda), camada 1.
 *
 * A Luna respondia TUDO com o modelo grande e lento: gastava ~12s de v4-pro para
 * dizer "tô bem, e você?". Mas o teste flash-vs-pro mostrou onde o modelo grande
 * realmente faz falta: **no peso emocional** (calibração fina de tom) e no técnico
 * (raciocínio). Em papo leve, a arquitetura sustenta a personalidade sozinha.
 *
 * Daí o gate: papo leve → modelo rápido; peso emocional OU técnico → modelo grande.
 *
 * Regra de ouro: classificar SEM chamada de LLM. Usa apenas sinais que o pipeline
 * já calculou (análise + tálamo) — senão o gate anularia o ganho de latência.
 */
export type PesoTurno = "leve" | "pesado";

/** Só a conversa trivial é candidata a leve. Todo o resto carrega peso. */
const INTENCOES_LEVES = new Set(["conversa_casual"]);

const PROFUNDIDADES_LEVES = new Set<ProfundidadeAnalise>(["simples", "moderado"]);

const RISCOS_LEVES = new Set(["nenhum", "baixo"]);

/**
 * `apoio_emocional` e `expressao_afetiva` NUNCA são leves: é onde o modelo grande
 * segura melhor o "presença, não utilidade" (curto, minúsculas, sem virar terapeuta).
 * `pergunta_identitaria` também não: alma, fé e "você é real?" merecem o melhor modelo.
 */
export function classificarPesoTurno(
  analise: Pick<
    AnaliseContexto,
    "intencao" | "nivel_risco" | "complexidade" | "requer_codigo" | "envolve_ferramenta"
  >,
  profundidade: ProfundidadeAnalise,
): PesoTurno {
  if (!INTENCOES_LEVES.has(analise.intencao)) return "pesado";
  if (!PROFUNDIDADES_LEVES.has(profundidade)) return "pesado";
  if (!RISCOS_LEVES.has(analise.nivel_risco)) return "pesado";
  if (analise.complexidade === "alta") return "pesado";
  if (analise.requer_codigo || analise.envolve_ferramenta) return "pesado";
  return "leve";
}

/** Kill-switch de produção: `LUNA_GATE_PESO=0` volta tudo para o modelo grande. */
export function gateDePesoAtivo(): boolean {
  const raw = process.env.LUNA_GATE_PESO?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * Escolhe o modelo da resposta. Só desvia para o menor quando o turno é leve,
 * o gate está ligado e existe de facto um modelo menor distinto.
 */
export function escolherModeloResposta(
  peso: PesoTurno,
  modeloMenor: string,
  modeloMaior: string,
): string {
  if (!gateDePesoAtivo()) return modeloMaior;
  if (peso !== "leve") return modeloMaior;
  if (!modeloMenor || modeloMenor === modeloMaior) return modeloMaior;
  return modeloMenor;
}
