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

// ─── P1 camada 3 — rigor (autocrítica) ─────────────────────────────────────────

/**
 * Turnos que precisam de RIGOR factual: consultoria/técnica onde o P0 mostrou
 * inconsistência (o "mofo branco" saía só 2/3 das vezes). É um SUBCONJUNTO de
 * "pesado" — peso emocional e identitário são pesados mas NÃO precisam de rigor
 * factual (ali o que importa é presença/alma, não checar fatos).
 */
const INTENCOES_RIGOR = new Set([
  "pergunta_tecnica",
  "pedido_codigo",
  "projeto_arquitetural",
  "pergunta_arquitetura",
  "pergunta_produto",
  "pergunta_ecossistema",
  "acao_critica",
]);

export function precisaRigor(
  analise: Pick<AnaliseContexto, "intencao">,
): boolean {
  if (!rigorAtivo()) return false;
  return INTENCOES_RIGOR.has(analise.intencao);
}

/** Kill-switch de produção: `LUNA_RIGOR=0` desliga o protocolo de rigor. */
export function rigorAtivo(): boolean {
  const raw = process.env.LUNA_RIGOR?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * Temperatura da resposta. 0.85 é ótimo para alma (papo), péssimo para
 * consistência técnica — no P0 a estocasticidade a 0.85 era o que fazia a nuance
 * "cair" às vezes. Em turno de rigor, baixa (default 0.35, via LUNA_TEMP_RIGOR).
 */
export function temperaturaResposta(rigor: boolean, base: number): number {
  if (!rigor) return base;
  const raw = process.env.LUNA_TEMP_RIGOR?.trim();
  const n = raw ? Number.parseFloat(raw) : 0.35;
  const temp = Number.isFinite(n) && n >= 0 ? n : 0.35;
  return Math.min(temp, base); // nunca sobe a temperatura
}

/**
 * Bloco injetado no briefing em turnos de rigor. Força a autocrítica DENTRO do
 * raciocínio (que já é streamado) — sem chamada de LLM extra. Duas passadas:
 * implicações dos fatos + stress-test da recomendação.
 */
export function blocoProtocoloRigor(): string {
  return [
    "── Protocolo de rigor (turno técnico — pense assim antes de responder) ──",
    "1. IMPLICAÇÕES: para cada fato concreto que a pessoa deu (local, cultura, época, restrição, ferramenta, número), pergunte-se o que ele EXIGE considerar e que ela NÃO nomeou. Ex.: um local implica clima, e clima implica riscos específicos. Puxe esses fios por conta própria.",
    "2. STRESS-TEST: antes de entregar, pergunte-se \"um especialista da área apontaria um furo óbvio nesta recomendação?\". Se sim, corrija ali mesmo.",
    "Faça isso de verdade no seu pensamento — não anuncie que fez, deixe transparecer na profundidade e na precisão da resposta.",
  ].join("\n");
}
