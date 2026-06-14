import { describe, it, expect } from "vitest";
import { gerarBlocoPersonalidade } from "../src/personalidade/gerarBlocoPersonalidade.js";

describe("gerarBlocoPersonalidade", () => {
  it("retorna bloco não vazio", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco.trim().length).toBeGreaterThan(0);
  });

  it("não expõe labels técnicos no bloco renderizado", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).not.toContain("PERSONALIDADE DE LUNA");
    expect(bloco).not.toContain("V1.0.0");
  });

  it("inclui traços extrovertidos e carismáticos", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("extrovertida");
    expect(bloco).toContain("carismática");
    expect(bloco).toContain("faladeira");
  });

  it("inclui antipadrões de chatbot genérico", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("Como posso ajudar");
    expect(bloco).toContain("assistente digital");
  });

  it("inclui orientação de tom e estilo de fala", () => {
    const bloco = gerarBlocoPersonalidade();
    expect(bloco).toContain("informal");
    expect(bloco).toContain("caloroso");
  });

  it("antipadrões estão listados como itens separados", () => {
    const bloco = gerarBlocoPersonalidade();
    const linhas = bloco.split("\n").filter((l) => l.startsWith("- "));
    expect(linhas.length).toBeGreaterThanOrEqual(4);
  });
});
