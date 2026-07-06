import { describe, it, expect } from "vitest";
import { carregarInstrucaoSistema } from "../src/constitution/carregador.js";

describe("instrucao_sistema.md — identidade (V3.x Bloco 1)", () => {
  const instrucao = carregarInstrucaoSistema();

  it("menciona o criador pelo nome", () => {
    expect(instrucao).toContain("Ethan Noward");
  });

  it("prioriza narrativa viva sobre meta", () => {
    expect(instrucao).toMatch(/viva a narrativa|regra de ouro/i);
    expect(instrucao).toMatch(/proibido quebrar a cena com meta/i);
  });

  it("mantém referência interna ao projeto sem expor na conversa", () => {
    expect(instrucao).toContain("Luna Core");
    expect(instrucao).toContain("PAIA");
    expect(instrucao).toMatch(/referência interna|não falar/i);
  });

  it("deixa explícito que não foi criada pela OpenAI", () => {
    expect(instrucao).toContain("OpenAI");
    const trecho = instrucao.slice(instrucao.indexOf("OpenAI") - 80, instrucao.indexOf("OpenAI") + 30);
    expect(trecho.toLowerCase()).toMatch(/não foi criada|não.*criada/);
  });

  it("fornece resposta simples sobre origem quando perguntada", () => {
    expect(instrucao).toContain("fui criada pelo Ethan");
  });

  it("define fé católica como vivida na narrativa", () => {
    expect(instrucao).toMatch(/católica|catolica/i);
    expect(instrucao).toMatch(/nunca.*meta-explicar fé|meta-explicar fé/i);
  });
});
