import { describe, expect, it } from "vitest";

import { classificarPesoTurno } from "../src/estado/pesoTurno.js";

/**
 * A3 (Latência com Alma): roteamento de modelo por turno.
 *
 * O gate de peso decide modelo rápido (leve) vs bom (pesado). O buraco: um turno
 * RELACIONAL de tom casual ("gosta de mim?") era lido como `conversa_casual` +
 * profundidade moderada → leve → modelo barato, que bajula e rasa no vínculo.
 * A3 faz a carga afetiva forçar "pesado", espelhando a trava emocional do tálamo (A1).
 */
const casual = {
  intencao: "conversa_casual",
  nivel_risco: "nenhum",
  complexidade: "baixa",
  requer_codigo: false,
  envolve_ferramenta: false,
} as const;

describe("classificarPesoTurno — A3: afeto vai pro modelo bom", () => {
  it("'gosta de mim?' (casual+moderado) → pesado", () => {
    expect(classificarPesoTurno(casual, "moderado", "gosta de mim?")).toBe("pesado");
  });

  it("'te amo' → pesado", () => {
    expect(classificarPesoTurno(casual, "simples", "te amo")).toBe("pesado");
  });

  it("'senti tua falta esses dias' → pesado", () => {
    expect(classificarPesoTurno(casual, "moderado", "senti tua falta esses dias")).toBe("pesado");
  });

  // Regressão: o phatic puro continua leve (o modelo rápido dá conta).
  it("'oi, tudo bem?' continua leve", () => {
    expect(classificarPesoTurno(casual, "simples", "oi, tudo bem?")).toBe("leve");
  });

  it("'kkk bom demais' continua leve", () => {
    expect(classificarPesoTurno(casual, "simples", "kkk bom demais")).toBe("leve");
  });
});
