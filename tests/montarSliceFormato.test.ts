import { describe, expect, it } from "vitest";

import { montarSliceFormato } from "../src/contexto/montarSliceFormato.js";

describe("montarSliceFormato", () => {
  it("gera slice sem markdown quando nível é nenhum", () => {
    const slice = montarSliceFormato({
      markdown_permitido: false,
      nivel_formato_md: "nenhum",
    });

    expect(slice).toContain("texto corrido");
    expect(slice).toContain("sem markdown");
    expect(slice).toContain("Tom:");
  });

  it("gera slice leve quando markdown é permitido", () => {
    const slice = montarSliceFormato({
      markdown_permitido: true,
      nivel_formato_md: "leve",
    });

    expect(slice).toContain("markdown leve");
    expect(slice).toContain("um heading curto");
    expect(slice).toContain("Boas práticas");
  });

  it("gera slice estruturado para conteúdo denso", () => {
    const slice = montarSliceFormato({
      markdown_permitido: true,
      nivel_formato_md: "estruturado",
    });

    expect(slice).toContain("markdown estruturado");
    expect(slice).toContain("seções curtas");
    expect(slice).toContain("blocos de código");
  });
});
