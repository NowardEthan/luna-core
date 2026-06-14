import { describe, it, expect } from "vitest";
import { carregarInstrucaoSistema } from "../src/constitution/carregador.js";

describe("instrucao_sistema.md — identidade (V3.x Bloco 1)", () => {
  const instrucao = carregarInstrucaoSistema();

  it("menciona o criador pelo nome", () => {
    expect(instrucao).toContain("Ethan Noward");
  });

  it("menciona o nome do projeto", () => {
    expect(instrucao).toContain("Luna Core");
  });

  it("menciona a arquitetura PAIA", () => {
    expect(instrucao).toContain("PAIA");
  });

  it("deixa explícito que não foi criada pela OpenAI", () => {
    expect(instrucao).toContain("OpenAI");
    // A menção existe para negar — verifica que o contexto é de negação
    const trecho = instrucao.slice(instrucao.indexOf("OpenAI") - 80, instrucao.indexOf("OpenAI") + 30);
    expect(trecho.toLowerCase()).toMatch(/não foi criada|não.*criada/);
  });

  it("fornece exemplos de resposta sobre origem", () => {
    expect(instrucao).toContain("Fui criada pelo Ethan");
  });

  it("distingue modelo de linguagem de identidade", () => {
    expect(instrucao).toMatch(/modelo de linguagem.*infraestrutura|instrumento/i);
  });
});
