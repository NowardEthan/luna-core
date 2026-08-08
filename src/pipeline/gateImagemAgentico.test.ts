import { describe, expect, it } from "vitest";

import { avaliarGateAgentico } from "./executarPipelineCompleto.js";
import type { ProvedorAgente } from "../providers/tipos.js";

const provedorAgente: ProvedorAgente = {
  completar: async () => ({ conteudo: "", modelo: "teste", latencia_ms: 0 }),
  completarComFerramentas: async () => ({ modelo: "teste", latencia_ms: 0 }),
};

describe("gate agentico de imagem", () => {
  it("abre ferramentas para pedido explicito de imagem mesmo sem documentosAtivo", () => {
    const gate = avaliarGateAgentico(
      provedorAgente,
      "gera uma imagem de um t-rex fofo em 9:16",
      [],
      [],
      false,
      false,
      false,
    );

    expect(gate.usar).toBe(true);
    expect(gate.motivo).toBe("gerar_imagem");
  });
});
