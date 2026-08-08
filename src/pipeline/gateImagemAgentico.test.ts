import { describe, expect, it } from "vitest";

import { avaliarGateAgentico, mensagemAceitaImagemPendente } from "./executarPipelineCompleto.js";
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

  it("trata 'gera pra mim' como aceite de prompt visual pendente", () => {
    expect(
      mensagemAceitaImagemPendente("Gera pra mim", [
        {
          papel: "assistant",
          conteudo:
            'Perfeito, aqui vai o prompt: "Anime style artwork of Roronoa Zoro with a cute green Yoshi, vibrant colors."',
        },
      ]),
    ).toBe(true);
  });

  it("mantem pendente quando a Luna prometeu buscar imagem", () => {
    expect(
      mensagemAceitaImagemPendente("sim por favor", [
        {
          papel: "assistant",
          conteudo: "Vou buscar uma imagem bem nessa linha — estilo anime, cores vivas. Ja te mostro!",
        },
      ]),
    ).toBe(true);
  });
});
