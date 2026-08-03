import { describe, expect, it } from "vitest";

import {
  MODELO_ARTE,
  MODELO_REALISTA,
  classificarEstiloImagem,
  escolherModeloGeracao,
} from "./rotearModeloImagem.js";

describe("rotearModeloImagem", () => {
  it("default = arte (Seedream)", () => {
    expect(classificarEstiloImagem("um gato fofo com chapéu")).toBe("arte");
    expect(classificarEstiloImagem("raposa origami dourada")).toBe("arte");
  });

  it("sinais de foto → realista (Riverflow)", () => {
    expect(classificarEstiloImagem("foto realista de uma pessoa na rua")).toBe("realista");
    expect(classificarEstiloImagem("photorealistic portrait, dslr 50mm")).toBe("realista");
    expect(classificarEstiloImagem("como uma foto de produto num fundo branco")).toBe("realista");
  });

  it("arte explícita vence foto vaga", () => {
    expect(classificarEstiloImagem("foto estilo anime de um samurai")).toBe("arte");
    expect(classificarEstiloImagem("ilustração digital de uma cidade")).toBe("arte");
  });

  it("escolherModeloGeracao devolve o slug certo", () => {
    delete process.env.OPENROUTER_IMAGE_MODEL;
    expect(escolherModeloGeracao("desenha um dragão watercolor").model).toBe(MODELO_ARTE);
    expect(escolherModeloGeracao("foto cinematográfica de uma praia").model).toBe(MODELO_REALISTA);
  });
});
