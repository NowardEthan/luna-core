import { describe, expect, it } from "vitest";
import {
  compilarContexto,
  entradasCompiladorSimples,
  orcamentoPorProfundidade,
} from "../src/contexto/compiladorContexto.js";
import { enxugarContextoParaSimples } from "../src/contexto/enxugarContexto.js";
import { classificarProfundidade } from "../src/estado/talamoPipeline.js";
import type { ContextoSessao } from "../src/memoria/esquemaMemoria.js";

describe("L2 dieta do simples — briefing mínimo", () => {
  it("'lembra?' não é classificado como simples", () => {
    expect(classificarProfundidade("lembra?")).not.toBe("simples");
  });

  it("'oi luna, tudo bem?' é simples", () => {
    expect(classificarProfundidade("oi luna, tudo bem?")).toBe("simples");
  });

  it("entradasCompiladorSimples não inclui sense/memórias/hábitos/ambiente", () => {
    const entradas = entradasCompiladorSimples("política mínima", {
      identidade: "Você é a Luna.",
      tempo: "Agora é segunda.",
      kernel: "Continuidade leve.",
      humor: "Calma.",
    });

    expect(entradas.sense).toBeUndefined();
    expect(entradas.ambiente).toBeUndefined();
    expect(entradas.memorias_longas).toBeUndefined();
    expect(entradas.habitos).toBeUndefined();
    expect(entradas.preditivo).toBeUndefined();
    expect(entradas.presenca).toBeUndefined();
    expect(entradas.rotina).toBeUndefined();
    expect(entradas.politica).toBe("política mínima");
    expect(entradas.identidade).toContain("Luna");
  });

  it("briefing compilado de «oi luna» não menciona sense/memórias/hábitos", () => {
    const entradas = entradasCompiladorSimples(
      "Ação: conversar. Tom: leve. Modo: presença.",
      {
        identidade: "Você é a Luna — voz, não assistente.",
        tempo: "Agora é domingo à tarde.",
        humor: "Valência positiva.",
      },
    );
    const { briefing } = compilarContexto(
      entradas,
      orcamentoPorProfundidade("simples"),
    );

    expect(briefing).not.toMatch(/── Sense ──/);
    expect(briefing).not.toMatch(/── Memórias/);
    expect(briefing).not.toMatch(/── Hábitos/);
    expect(briefing).not.toMatch(/── Ambiente/);
    expect(briefing).toContain("Luna");
  });

  it("enxugarContextoParaSimples zera sense/ambiente/memorias_longas e mantém histórico", () => {
    const contexto: ContextoSessao = {
      historico: [
        { papel: "user", conteudo: "oi" },
        { papel: "assistant", conteudo: "oi!" },
      ],
      fatos: ["Gosta de café."],
      preferencias: {},
      contexto_sense: "tela do Orbit",
      contexto_ambiente: "IDE aberta",
      memorias_longas: ["Fato antigo de outra conversa"],
    };

    const enxuto = enxugarContextoParaSimples(contexto);

    expect(enxuto.historico).toHaveLength(2);
    expect(enxuto.contexto_sense).toBeUndefined();
    expect(enxuto.contexto_ambiente).toBeUndefined();
    expect(enxuto.memorias_longas).toBeUndefined();
    expect(enxuto.fatos).toContain("Gosta de café.");
  });
});
