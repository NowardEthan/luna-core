import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { existsSync, rmSync } from "node:fs";

import { criarProvedorMock } from "../src/providers/mockProvedor.js";
import { executarPipelineCompleto } from "../src/pipeline/executarPipelineCompleto.js";
import { caminhoSessao } from "../src/memoria/storeSessao.js";
import type { ConfigLuna } from "../src/providers/tipos.js";

/**
 * P1 camada 1 — gate de peso, ponta a ponta no pipeline.
 * Turno leve responde no modelo MENOR (rápido); peso emocional/técnico continua no MAIOR.
 */

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost",
  modeloMenor: "menor",
  modeloMaior: "maior",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

function analise(intencao: string, complexidade = "baixa", nivel_risco = "nenhum"): string {
  return JSON.stringify({
    intencao,
    complexidade,
    nivel_risco,
    requer_markdown: false,
    requer_codigo: false,
    requer_ferramenta: false,
    envolve_ferramenta: false,
    requer_memoria: false,
    deve_perguntar_mais: false,
    confianca: 0.9,
    motivos: ["teste"],
  });
}

const sessoes: string[] = [];

beforeEach(() => {
  delete process.env.LUNA_GATE_PESO; // gate ligado por default
});

afterEach(() => {
  for (const id of sessoes) {
    const p = caminhoSessao(id);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  sessoes.length = 0;
});

async function rodar(sessaoId: string, mensagem: string, intencaoAnalise: string, complexidade?: string) {
  sessoes.push(sessaoId);
  const provedor = criarProvedorMock({
    menor: analise(intencaoAnalise, complexidade),
    maior: "resposta do modelo grande",
  });
  return executarPipelineCompleto(mensagem, {
    sessaoId,
    provedor,
    config: CONFIG,
    usarNeuronioMemoriaLlm: false,
  });
}

describe("Gate de peso no pipeline (P1 camada 1)", () => {
  it("turno casual responde no modelo MENOR", async () => {
    const r = await rodar("gate-casual", "oi! tudo bem?", "conversa_casual");
    expect(r.resposta?.modelo).toBe("menor");
  });

  it("apoio emocional continua no modelo MAIOR", async () => {
    const r = await rodar("gate-emocional", "tô meio pra baixo hoje", "apoio_emocional");
    expect(r.resposta?.modelo).toBe("maior");
    expect(r.resposta?.texto).toBe("resposta do modelo grande");
  });

  it("expressão afetiva continua no modelo MAIOR", async () => {
    const r = await rodar("gate-afetivo", "obrigado, viu", "expressao_afetiva");
    expect(r.resposta?.modelo).toBe("maior");
  });

  it("pergunta técnica continua no modelo MAIOR", async () => {
    const r = await rodar(
      "gate-tecnico",
      "me explica a diferença entre índice hash e B-tree num banco de dados",
      "pergunta_tecnica",
      "media",
    );
    expect(r.resposta?.modelo).toBe("maior");
  });

  it("pergunta identitária continua no modelo MAIOR", async () => {
    const r = await rodar("gate-identidade", "você acredita em Deus?", "pergunta_identitaria");
    expect(r.resposta?.modelo).toBe("maior");
  });

  it("kill-switch LUNA_GATE_PESO=0 devolve o casual ao modelo MAIOR", async () => {
    process.env.LUNA_GATE_PESO = "0";
    const r = await rodar("gate-off", "oi! tudo bem?", "conversa_casual");
    expect(r.resposta?.modelo).toBe("maior");
    delete process.env.LUNA_GATE_PESO;
  });
});
