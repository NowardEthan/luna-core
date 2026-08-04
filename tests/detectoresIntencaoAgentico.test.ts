import { describe, expect, it } from "vitest";
import {
  decidirGateAgentico,
  mensagemPareceLancamentoRapido,
  mensagemPedeFinancas,
  mensagemPedeProfundidade,
  mensagemSugerePesquisaWeb,
} from "../src/pipeline/detectoresIntencao.js";

describe("mensagemSugerePesquisaWeb (A2)", () => {
  it("não marca papo casual", () => {
    expect(mensagemSugerePesquisaWeb("oi")).toBe(false);
    expect(mensagemSugerePesquisaWeb("tudo bem?")).toBe(false);
  });

  it("não marca «pesquisa» substantivo possessivo (FP)", () => {
    expect(mensagemSugerePesquisaWeb("minha pesquisa da faculdade tá pronta")).toBe(false);
    expect(mensagemSugerePesquisaWeb("essa pesquisa foi difícil")).toBe(false);
  });

  it("marca pedido explícito de busca", () => {
    expect(mensagemSugerePesquisaWeb("pesquisa o preço do dólar")).toBe(true);
    expect(mensagemSugerePesquisaWeb("busca notícias sobre o lançamento")).toBe(true);
    expect(mensagemSugerePesquisaWeb("google isso pra mim")).toBe(true);
  });
});

describe("mensagemPedeFinancas (A2)", () => {
  it("marca verbo de grana e lançamento rápido", () => {
    expect(mensagemPedeFinancas("gastei 50 no almoço")).toBe(true);
    expect(mensagemPedeFinancas("registra 50 reais no almoço")).toBe(true);
    expect(mensagemPedeFinancas("50 reais no uber")).toBe(true);
    expect(mensagemPedeFinancas("R$ 32")).toBe(true);
  });

  it("não marca metáfora com reais (FP)", () => {
    expect(mensagemPedeFinancas("isso vale 50 reais de aprendizado")).toBe(false);
    expect(mensagemPareceLancamentoRapido("isso vale 50 reais de aprendizado")).toBe(false);
  });

  it("não marca small talk", () => {
    expect(mensagemPedeFinancas("oi")).toBe(false);
    expect(mensagemPedeFinancas("obrigado")).toBe(false);
  });
});

describe("mensagemPedeProfundidade (A3)", () => {
  it("marca pedido analítico", () => {
    expect(mensagemPedeProfundidade("explica como funciona o soft router a fundo")).toBe(true);
    expect(mensagemPedeProfundidade("me explica em detalhe a LGPD")).toBe(true);
  });

  it("não marca small talk", () => {
    expect(mensagemPedeProfundidade("oi")).toBe(false);
    expect(mensagemPedeProfundidade("tudo bem?")).toBe(false);
    expect(mensagemPedeProfundidade("obrigado")).toBe(false);
  });
});

describe("decidirGateAgentico (A2)", () => {
  it("tabela A0 — leve sem sinais", () => {
    const g = decidirGateAgentico({
      forcar: false,
      vision: false,
      documentoAnexo: false,
      web: false,
      pedeDocumento: false,
      editaDocumento: false,
      financas: false,
      gerarImagem: false,
    });
    expect(g.usar).toBe(false);
    expect(g.motivo).toBeNull();
  });

  it("forçado (módulo finanças) vence", () => {
    const g = decidirGateAgentico({
      forcar: true,
      vision: false,
      documentoAnexo: false,
      web: false,
      pedeDocumento: false,
      editaDocumento: false,
      financas: false,
      gerarImagem: false,
    });
    expect(g).toEqual({ usar: true, motivo: "forcado" });
  });

  it("financas e documento têm motivo", () => {
    expect(
      decidirGateAgentico({
        forcar: false,
        vision: false,
        documentoAnexo: false,
        web: false,
        pedeDocumento: false,
        editaDocumento: false,
        financas: true,
        gerarImagem: false,
      }).motivo,
    ).toBe("financas");
    expect(
      decidirGateAgentico({
        forcar: false,
        vision: false,
        documentoAnexo: false,
        web: false,
        pedeDocumento: true,
        editaDocumento: false,
        financas: false,
        gerarImagem: false,
      }).motivo,
    ).toBe("pede_documento");
  });
});
