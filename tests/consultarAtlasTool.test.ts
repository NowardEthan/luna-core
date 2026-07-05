import { afterEach, describe, expect, it, vi } from "vitest";
import { responderComoLunaAgentico } from "../src/responder/responderComoLunaAgentico.js";
import type { ConfigLuna, ProvedorAgente } from "../src/providers/tipos.js";

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost:1234/v1",
  modeloMenor: "llama-3.1-8b-instant",
  modeloMaior: "gpt-oss-120b",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

function provedorComConsultaAtlas(): ProvedorAgente {
  return {
    completar: vi.fn(),
    completarComFerramentas: vi
      .fn()
      .mockResolvedValueOnce({
        chamadas: [
          {
            id: "tool_1",
            nome: "consultar_atlas",
            argumentos: { consulta: "atlas tool", limite: 3 },
          },
        ],
        modelo: CONFIG.modeloMaior,
        latencia_ms: 6,
      })
      .mockResolvedValueOnce({
        conteudo: "Usei o Atlas e trouxe o contexto pedido.",
        modelo: CONFIG.modeloMaior,
        latencia_ms: 5,
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consultar_atlas tool", () => {
  it("executa consulta Atlas e conclui resposta", async () => {
    const provedor = provedorComConsultaAtlas();
    const onAcao = vi.fn();

    const resposta = await responderComoLunaAgentico(
      "Consulta no Atlas como funciona a tool.",
      provedor,
      CONFIG,
      { briefing: "Contexto Atlas", tokens_estimados: 8, cortes: [] },
      { onAcao },
    );

    expect(resposta.texto).toContain("Usei o Atlas");
    expect(onAcao).toHaveBeenCalledTimes(2);
    expect(onAcao).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tipo: "inicio_ferramenta", ferramenta: "consultar_atlas" }),
    );
    expect(onAcao).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tipo: "fim_ferramenta", ferramenta: "consultar_atlas", sucesso: true }),
    );
  });
});
