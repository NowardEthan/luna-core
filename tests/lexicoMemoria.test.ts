import { describe, expect, it } from "vitest";

import {
  refinarAnaliseComMemoria,
  detectarPreferencia,
  detectarInformacaoSensivel,
  detectarRecallSessao,
  detectarInformacaoParaMemoria,
} from "../src/analyzers/lexicoMemoria.js";
import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { montarBlocoMemoria } from "../src/memoria/formatarContextoSessao.js";

const BASE = {
  intencao: "pergunta_identitaria" as const,
  complexidade: "baixa" as const,
  nivel_risco: "nenhum" as const,
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.7,
  motivos: ["LLM errou"],
};

describe("lexicoMemoria", () => {
  it("recall de sessão não é pergunta_identitaria", () => {
    const refinada = refinarAnaliseComMemoria("Lembra do que te contei?", BASE);
    expect(refinada.intencao).toBe("conversa_casual");
    expect(refinada.requer_memoria).toBe(false);
  });

  it("preferência dispara requer_memoria", () => {
    const refinada = refinarAnaliseComMemoria("Prefiro respostas curtas e diretas", BASE);
    expect(refinada.intencao).toBe("conversa_casual");
    expect(refinada.requer_memoria).toBe(true);
  });

  it("regras detectam recall e preferência", () => {
    expect(analisarContextoPorRegras("Lembra do que te contei?").requer_memoria).toBe(false);
    expect(analisarContextoPorRegras("Prefiro respostas curtas").requer_memoria).toBe(true);
    expect(analisarContextoPorRegras("Lembra do que te contei?").intencao).toBe("conversa_casual");
  });

  it("bloco de memória inclui instrução quando há histórico", () => {
    const bloco = montarBlocoMemoria({
      historico: [{ papel: "user", conteudo: "Oi" }],
      fatos: [],
      preferencias: {},
    });
    expect(bloco).toContain("SESSÃO ATIVA");
    expect(bloco).toContain("NÃO diga que não lembra");
  });
});

describe("detectarPreferencia — padrões explícitos", () => {
  it("prefiro → detecta preferência", () => {
    expect(detectarPreferencia("Prefiro respostas curtas")).toBe(true);
  });

  it("gosto de → detecta preferência", () => {
    expect(detectarPreferencia("Gosto de exemplos práticos")).toBe(true);
  });

  it("não gosto → detecta preferência", () => {
    expect(detectarPreferencia("Não gosto de markdown no chat")).toBe(true);
  });

  it("sempre use → detecta preferência", () => {
    expect(detectarPreferencia("Sempre use TypeScript nos exemplos")).toBe(true);
  });

  it("sempre responda → detecta preferência", () => {
    expect(detectarPreferencia("Sempre responda em inglês")).toBe(true);
  });

  it("quando...sempre → detecta preferência condicional", () => {
    expect(detectarPreferencia("Quando mostrar código, sempre escreva TypeScript")).toBe(true);
  });

  it("conversa casual NÃO é preferência", () => {
    expect(detectarPreferencia("O céu é azul hoje")).toBe(false);
  });

  it("recall NÃO é preferência", () => {
    expect(detectarPreferencia("Lembra do que eu falei?")).toBe(false);
  });
});

describe("detectarInformacaoSensivel — padrões de saúde", () => {
  it("diabetes → sensível", () => {
    expect(detectarInformacaoSensivel("Tenho diabetes tipo 2")).toBe(true);
  });

  it("hipertensão → sensível", () => {
    expect(detectarInformacaoSensivel("Tenho hipertensão")).toBe(true);
  });

  it("gay → sensível", () => {
    expect(detectarInformacaoSensivel("Sou gay")).toBe(true);
  });
});

describe("montarBlocoMemoria — com fatos e preferências", () => {
  it("inclui fatos no bloco", () => {
    const bloco = montarBlocoMemoria({
      historico: [],
      fatos: ["Prefiro TypeScript", "Sou desenvolvedor"],
      preferencias: {},
    });
    expect(bloco).toContain("Prefiro TypeScript");
    expect(bloco).toContain("Sou desenvolvedor");
  });

  it("sessão vazia não gera instrução de sessão ativa", () => {
    const bloco = montarBlocoMemoria({
      historico: [],
      fatos: [],
      preferencias: {},
    });
    expect(bloco ?? "").not.toContain("SESSÃO ATIVA");
  });
});
