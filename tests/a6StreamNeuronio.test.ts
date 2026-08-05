import { describe, expect, it, vi } from "vitest";
import { processarLinhasSseAgente } from "../src/providers/streamAgente.js";
import {
  consultarNeuronioSubagente,
  resolverEspecialidadeNeuronio,
} from "../src/agente/neuronioSubagente.js";
import type { ConfigLuna } from "../src/providers/tipos.js";

describe("processarLinhasSseAgente", () => {
  it("acumula content, reasoning e tool_calls por index", () => {
    const chunks: Array<{ tipo: string }> = [];
    processarLinhasSseAgente(
      [
        'data: {"model":"m1","choices":[{"delta":{"content":"Vou "}}]}',
        'data: {"choices":[{"delta":{"content":"ler."}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"ler_secao","arguments":"{\\"id\\""}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"d1\\"}"}}]}}]}',
        "data: [DONE]",
      ],
      (c) => chunks.push(c),
    );
    const contents = chunks.filter((c) => c.tipo === "content") as Array<{ delta: string }>;
    expect(contents.map((c) => c.delta).join("")).toBe("Vou ler.");
    expect(chunks.filter((c) => c.tipo === "tool_call_delta")).toHaveLength(2);
  });
});

describe("resolverEspecialidadeNeuronio", () => {
  it("resolve aliases com acento", () => {
    expect(resolverEspecialidadeNeuronio("cânone")).toBe("canone");
    expect(resolverEspecialidadeNeuronio("pesquisa")).toBe("pesquisa");
    expect(resolverEspecialidadeNeuronio("web")).toBe("pesquisa");
    expect(resolverEspecialidadeNeuronio("xyz")).toBeNull();
  });
});

describe("consultarNeuronioSubagente", () => {
  const config: ConfigLuna = {
    apiKey: "t",
    baseUrl: "http://x",
    modeloMenor: "small",
    modeloMaior: "big",
    temperaturaMenor: 0,
    temperaturaMaior: 0.5,
  };

  it("pede pergunta", async () => {
    const provedor = { completar: vi.fn() };
    const r = await consultarNeuronioSubagente(
      { provedor: provedor as never, config },
      { especialidade: "orientacao" },
    );
    expect(r).toMatch(/^ERRO/);
    expect(provedor.completar).not.toHaveBeenCalled();
  });

  it("devolve conselho do neuronio canone", async () => {
    const provedor = {
      completar: vi.fn().mockResolvedValue({
        conteudo: "Anote: Maria tem 17 anos. acao adicionar.",
        modelo: "small",
        latencia_ms: 1,
      }),
    };
    const r = await consultarNeuronioSubagente(
      { provedor: provedor as never, config },
      {
        especialidade: "canone",
        pergunta: "Preciso anotar a idade da Maria?",
        contexto: "Maria aparece no cap. 1",
      },
    );
    expect(r).toMatch(/Neurônio «canone»/);
    expect(r).toMatch(/17 anos/);
  });
});
