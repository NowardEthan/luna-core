import { describe, expect, it } from "vitest";
import {
  decidirGateAgentico,
  mensagemPareceLancamentoRapido,
  mensagemPedeFinancas,
  mensagemPedeProfundidade,
  mensagemSugerePesquisaWeb,
} from "../src/pipeline/detectoresIntencao.js";
import {
  mensagemPareceEdicaoDocumento,
  mensagemPedeDocumento,
} from "../src/pipeline/executarPipelineCompleto.js";

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

  it("marca fato público/atualizável sem verbo «pesquisar»", () => {
    expect(mensagemSugerePesquisaWeb("qual a última versão do Node?")).toBe(true);
    expect(mensagemSugerePesquisaWeb("quanto custa o ChatGPT Plus")).toBe(true);
    expect(mensagemSugerePesquisaWeb("como está o dólar hoje")).toBe(true);
    expect(mensagemSugerePesquisaWeb("status do lançamento do iPhone")).toBe(true);
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

describe("mensagemPedeDocumento / mensagemPareceEdicaoDocumento (artefato)", () => {
  it("marca criação de capítulo/livro como pedido de artefato", () => {
    expect(mensagemPedeDocumento("escreve o epílogo num artefato")).toBe(true);
    expect(mensagemPedeDocumento("cria o primeiro capítulo do livro")).toBe(true);
    expect(mensagemPedeDocumento("faz um conto sobre a lua")).toBe(true);
  });

  it("não marca small talk como pedido de artefato", () => {
    expect(mensagemPedeDocumento("oi")).toBe(false);
    expect(mensagemPedeDocumento("gostei demais")).toBe(false);
  });

  it("marca continuação de obra na conversa que já tem estante", () => {
    // O caso do bug: ela jurava que escreveu o capítulo sem tool — gate estava fechado.
    expect(
      mensagemPareceEdicaoDocumento(
        "gostei demais, continua com um primeiro capítulo",
      ),
    ).toBe(true);
    expect(mensagemPareceEdicaoDocumento("escreve o capítulo 2 no artefato")).toBe(true);
    expect(mensagemPareceEdicaoDocumento("agora o epílogo")).toBe(true);
    expect(mensagemPareceEdicaoDocumento("prossegue a história")).toBe(true);
  });

  it("gate liga edita_documento nesse follow-up", () => {
    const g = decidirGateAgentico({
      forcar: false,
      vision: false,
      documentoAnexo: false,
      web: false,
      pedeDocumento: false,
      editaDocumento: mensagemPareceEdicaoDocumento(
        "gostei demais, continua com um primeiro capítulo",
      ),
      financas: false,
      gerarImagem: false,
    });
    expect(g).toEqual({ usar: true, motivo: "edita_documento" });
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
