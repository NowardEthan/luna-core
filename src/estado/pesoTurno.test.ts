import { describe, expect, it } from "vitest";
import {
  classificarPesoTurno,
  escolherModeloResposta,
  precisaRigor,
  temperaturaResposta,
} from "./pesoTurno.js";
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

describe("precisaRigor (camada 3)", () => {
  const anterior = process.env.LUNA_RIGOR;

  it("intenções técnicas/consultivas precisam de rigor", () => {
    for (const intencao of [
      "pergunta_tecnica",
      "pedido_codigo",
      "projeto_arquitetural",
      "pergunta_arquitetura",
      "acao_critica",
    ]) {
      expect(precisaRigor({ intencao } as never)).toBe(true);
    }
  });

  it("papo/emocional/identitário NÃO precisam de rigor factual", () => {
    for (const intencao of [
      "conversa_casual",
      "apoio_emocional",
      "expressao_afetiva",
      "pergunta_identitaria",
    ]) {
      expect(precisaRigor({ intencao } as never)).toBe(false);
    }
  });

  it("kill-switch LUNA_RIGOR=0 desliga tudo", () => {
    process.env.LUNA_RIGOR = "0";
    expect(precisaRigor({ intencao: "pergunta_tecnica" } as never)).toBe(false);
    if (anterior === undefined) delete process.env.LUNA_RIGOR;
    else process.env.LUNA_RIGOR = anterior;
  });
});

describe("temperaturaResposta (camada 3)", () => {
  it("turno sem rigor mantém a temperatura base", () => {
    expect(temperaturaResposta(false, 0.85)).toBe(0.85);
  });

  it("turno de rigor baixa a temperatura (default 0.35)", () => {
    const anterior = process.env.LUNA_TEMP_RIGOR;
    delete process.env.LUNA_TEMP_RIGOR;
    expect(temperaturaResposta(true, 0.85)).toBe(0.35);
    if (anterior !== undefined) process.env.LUNA_TEMP_RIGOR = anterior;
  });

  it("nunca sobe a temperatura acima da base", () => {
    const anterior = process.env.LUNA_TEMP_RIGOR;
    process.env.LUNA_TEMP_RIGOR = "0.9";
    expect(temperaturaResposta(true, 0.4)).toBe(0.4);
    if (anterior === undefined) delete process.env.LUNA_TEMP_RIGOR;
    else process.env.LUNA_TEMP_RIGOR = anterior;
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
