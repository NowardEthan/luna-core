import { describe, expect, it } from "vitest";

import { limparTituloConversa } from "./gerarTituloConversa.js";

describe("limparTituloConversa", () => {
  it("aceita título limpo", () => {
    expect(limparTituloConversa("Receita de bolo")).toBe("Receita de bolo");
  });

  it("tira prefixo e aspas", () => {
    expect(limparTituloConversa('Título: "Viagem a Lisboa"')).toBe("Viagem a Lisboa");
  });

  it("corta a 6 palavras / 40 chars", () => {
    const longo =
      "Uma conversa muito longa sobre vários assuntos diferentes e mais ainda";
    const limpo = limparTituloConversa(longo);
    expect(limpo).not.toBeNull();
    expect(limpo!.split(/\s+/).length).toBeLessThanOrEqual(6);
    expect(limpo!.length).toBeLessThanOrEqual(40);
  });

  it("rejeita vazio / reticências", () => {
    expect(limparTituloConversa("   ")).toBeNull();
    expect(limparTituloConversa("…")).toBeNull();
  });
});
