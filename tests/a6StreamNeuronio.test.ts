import { describe, expect, it } from "vitest";
import { processarLinhasSseAgente } from "../src/providers/streamAgente.js";
import { consultarNeuronioSubagente } from "../src/agente/neuronioSubagente.js";
import type { ConfigLuna } from "../src/providers/tipos.js";
import { vi } from "vitest";

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
    const tools = chunks.filter((c) => c.tipo === "tool_call_delta");
    expect(tools.length).toBe(2);
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

  it("devolve conselho do neuronio", async () => {
    const provedor = {
      completar: vi.fn().mockResolvedValue({
        conteudo: "Leia so o cap. 2 e continue com inserir_blocos.",
        modelo: "small",
        latencia_ms: 1,
      }),
    };
    const r = await consultarNeuronioSubagente(
      { provedor: provedor as never, config },
      {
        especialidade: "orientacao",
        pergunta: "Continuo o 2 ou volto ao 1?",
        contexto: "1. Cap 1\n2. Cap 2",
      },
    );
    expect(r).toMatch(/Neurônio «orientacao»/);
    expect(r).toMatch(/inserir_blocos/);
    expect(provedor.completar).toHaveBeenCalledOnce();
  });
});
