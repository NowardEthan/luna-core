import { describe, expect, it } from "vitest";

import { inferirEFormatarConhecimento } from "../src/conhecimento/formatarConhecimento.js";
import { formatarGuiaProduto } from "../src/conhecimento/formatarGuiaProduto.js";
import { formatarGuiaSuperficie } from "../src/conhecimento/formatarGuiaSuperficie.js";

describe("guias de superfície e produto", () => {
  it("formata guia de superfície do desktop", async () => {
    const guia = await formatarGuiaSuperficie("desktop");
    expect(guia).toContain("Orbit Desktop");
    expect(guia).toContain("Perguntas típicas");
  });

  it("formata guia de produto Orbit", async () => {
    const guia = await formatarGuiaProduto();
    expect(guia).toContain("Guia de produto");
    expect(guia).toContain("Orbit");
  });

  it("injeta guia de produto em pergunta_produto", async () => {
    const bloco = await inferirEFormatarConhecimento("como funciona o Orbit?", 3, {
      intencao: "pergunta_produto",
      ambiente: "desktop",
    });
    expect(bloco).toContain("Guia de produto");
    expect(bloco).toContain("Guia de superfície");
  });
});
