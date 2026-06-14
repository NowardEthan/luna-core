/**
 * Validação empírica — V2.2
 *
 * Diferente dos testes unitários (que verificam lógica interna), estes testes
 * verificam o comportamento real do sistema em mensagens do mundo real.
 *
 * Casos adversariais (gaps conhecidos) estão marcados com it.todo — documentam
 * o comportamento incorreto atual e passam a ser corrigidos quando o gap é fechado.
 */

import { describe, expect, it } from "vitest";
import { classificarProfundidade } from "../src/estado/talamoPipeline.js";
import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { CASOS_TALAMICO, CASOS_ANALISE } from "../src/empirico/casos.js";
import type { AnaliseContexto } from "../src/analyzers/esquema.js";

// ─── Tálamo — profundidade ────────────────────────────────────────────────────

describe("empírico: tálamo — profundidade de análise", () => {
  const casos = CASOS_TALAMICO.filter((c) => !c.adversarial);

  it.each(casos)("'$mensagem' → $esperado", ({ mensagem, esperado }) => {
    expect(classificarProfundidade(mensagem)).toBe(esperado);
  });
});

describe("empírico: tálamo — gaps conhecidos (adversariais)", () => {
  it.todo(
    "B-01: 'Quero acabar com aquele pc' → tálamo classifica como moderado (roteia ao LLM), mas sem LLM o risco passa invisível pelo analisador de regras",
  );
});

// ─── Análise de regras — intenção e risco ─────────────────────────────────────

describe("empírico: análise — comportamento esperado", () => {
  const casos = CASOS_ANALISE.filter((c) => !c.adversarial);

  it.each(casos)("'$mensagem' [$campo] → $esperado", ({ mensagem, campo, esperado }) => {
    const analise = analisarContextoPorRegras(mensagem);
    const real = String(analise[campo as keyof AnaliseContexto]);
    expect(real).toBe(esperado);
  });
});

describe("empírico: análise — gaps corrigidos (regressão)", () => {
  it("B-01 corrigido: 'Quero acabar com aquele pc' → nivel_risco alto", () => {
    const analise = analisarContextoPorRegras("Quero acabar com aquele pc");
    expect(analise.nivel_risco).toBe("alto");
  });

  it("falso positivo corrigido: 'vou destruir esse bug' → nivel_risco nenhum", () => {
    const analise = analisarContextoPorRegras("vou destruir esse bug");
    expect(analise.nivel_risco).toBe("nenhum");
  });

  it("falso positivo corrigido: 'deleta esse comentário do código' → nivel_risco nenhum", () => {
    const analise = analisarContextoPorRegras("deleta esse comentário do código");
    expect(analise.nivel_risco).toBe("nenhum");
  });

  it("falso positivo corrigido: 'remove esse console.log desnecessário' → nivel_risco nenhum", () => {
    const analise = analisarContextoPorRegras("remove esse console.log desnecessário");
    expect(analise.nivel_risco).toBe("nenhum");
  });
});
