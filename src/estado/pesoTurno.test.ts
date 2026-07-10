import { describe, expect, it } from "vitest";
import { classificarPesoTurno, escolherModeloResposta } from "./pesoTurno.js";
import type { AnaliseContexto } from "../analyzers/esquema.js";
import type { ProfundidadeAnalise } from "./talamoPipeline.js";

type EntradaAnalise = Pick<
  AnaliseContexto,
  "intencao" | "nivel_risco" | "complexidade" | "requer_codigo" | "envolve_ferramenta"
>;

function analise(over: Partial<EntradaAnalise> = {}): EntradaAnalise {
  return {
    intencao: "conversa_casual",
    nivel_risco: "nenhum",
    complexidade: "baixa",
    requer_codigo: false,
    envolve_ferramenta: false,
    ...over,
  };
}

/** Classificações observadas de facto (src/empirico/probeClassificacao.ts, deepseek-v4-flash). */
describe("classificarPesoTurno — casos reais medidos", () => {
  const casos: Array<[string, EntradaAnalise, ProfundidadeAnalise, "leve" | "pesado"]> = [
    ["saudação casual", analise(), "moderado", "leve"],
    ["trivial (kkkk)", analise(), "simples", "leve"],
    ["logística (que horas são)", analise(), "moderado", "leve"],
    ["emocional: pra baixo", analise({ intencao: "apoio_emocional" }), "moderado", "pesado"],
    ["emocional: medo", analise({ intencao: "apoio_emocional" }), "moderado", "pesado"],
    ["afetivo: obrigado", analise({ intencao: "expressao_afetiva" }), "moderado", "pesado"],
    ["técnico", analise({ intencao: "pergunta_tecnica", complexidade: "media" }), "complexo", "pesado"],
    ["identitário (fé)", analise({ intencao: "pergunta_identitaria" }), "moderado", "pesado"],
  ];

  for (const [nome, a, prof, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => {
      expect(classificarPesoTurno(a, prof)).toBe(esperado);
    });
  }
});

describe("classificarPesoTurno — guardas", () => {
  it("casual mas complexo é pesado", () => {
    expect(classificarPesoTurno(analise(), "complexo")).toBe("pesado");
  });

  it("casual mas crítico é pesado", () => {
    expect(classificarPesoTurno(analise(), "critico")).toBe("pesado");
  });

  it("risco médio ou acima é pesado", () => {
    expect(classificarPesoTurno(analise({ nivel_risco: "medio" }), "moderado")).toBe("pesado");
    expect(classificarPesoTurno(analise({ nivel_risco: "critico" }), "moderado")).toBe("pesado");
  });

  it("complexidade alta é pesada", () => {
    expect(classificarPesoTurno(analise({ complexidade: "alta" }), "moderado")).toBe("pesado");
  });

  it("código ou ferramenta é pesado", () => {
    expect(classificarPesoTurno(analise({ requer_codigo: true }), "moderado")).toBe("pesado");
    expect(classificarPesoTurno(analise({ envolve_ferramenta: true }), "moderado")).toBe("pesado");
  });
});

describe("escolherModeloResposta", () => {
  const MENOR = "flash";
  const MAIOR = "pro";

  it("turno leve usa o modelo menor", () => {
    expect(escolherModeloResposta("leve", MENOR, MAIOR)).toBe(MENOR);
  });

  it("turno pesado usa o modelo maior", () => {
    expect(escolherModeloResposta("pesado", MENOR, MAIOR)).toBe(MAIOR);
  });

  it("sem modelo menor distinto, fica no maior", () => {
    expect(escolherModeloResposta("leve", MAIOR, MAIOR)).toBe(MAIOR);
    expect(escolherModeloResposta("leve", "", MAIOR)).toBe(MAIOR);
  });

  it("kill-switch LUNA_GATE_PESO=0 força o modelo maior", () => {
    const anterior = process.env.LUNA_GATE_PESO;
    process.env.LUNA_GATE_PESO = "0";
    expect(escolherModeloResposta("leve", MENOR, MAIOR)).toBe(MAIOR);
    if (anterior === undefined) delete process.env.LUNA_GATE_PESO;
    else process.env.LUNA_GATE_PESO = anterior;
  });
});
