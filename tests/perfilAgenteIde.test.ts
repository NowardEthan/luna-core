import { describe, expect, it } from "vitest";
import { ehAmbienteIde, montarBlocoPerfilAgenteIde } from "../src/agente/perfilAgenteIde.js";

describe("perfilAgenteIde", () => {
  it("marca luna_ide e forge como ambientes IDE", () => {
    expect(ehAmbienteIde("luna_ide")).toBe(true);
    expect(ehAmbienteIde("forge")).toBe(true);
    expect(ehAmbienteIde("desktop")).toBe(false);
  });

  it("pede Markdown e profundidade na resposta final, não resumo curto", () => {
    const bloco = montarBlocoPerfilAgenteIde();
    expect(bloco).toMatch(/Luna IDE/);
    expect(bloco).toMatch(/Markdown/);
    expect(bloco).toMatch(/Resposta final/);
    expect(bloco).not.toMatch(/2-3 linhas/);
    expect(bloco).toMatch(/análise/);
  });
});
