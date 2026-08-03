import { describe, expect, it } from "vitest";

import {
  confabulouImagem,
  pediuImagem,
  respostaAlegaImagemEnviada,
  textoDesculpaImagem,
} from "./guardaImagem.js";

describe("guardaImagem", () => {
  it("reconhece pedido de desenho", () => {
    expect(pediuImagem("desenha um gato fofo")).toBe(true);
    expect(pediuImagem("gera uma imagem de um quarto")).toBe(true);
    expect(pediuImagem("bom dia luna")).toBe(false);
  });

  it("reconhece alegação de envio", () => {
    expect(respostaAlegaImagemEnviada("prontinho, mandei a imagem!")).toBe(true);
    expect(respostaAlegaImagemEnviada("desenhei um gato pastel pra ti")).toBe(true);
    expect(respostaAlegaImagemEnviada("posso desenhar se quiseres")).toBe(false);
  });

  it("confabulou = pediu + alegou + zero URL", () => {
    expect(
      confabulouImagem("prontinho, mandei a imagem!", 0, "desenha um gato"),
    ).toBe(true);
    expect(
      confabulouImagem("prontinho, mandei a imagem!", 1, "desenha um gato"),
    ).toBe(false);
    expect(confabulouImagem("kk bom dia", 0, "bom dia")).toBe(false);
  });

  it("desculpa é honesta e curta", () => {
    expect(textoDesculpaImagem()).toMatch(/tentei desenhar/i);
    expect(textoDesculpaImagem()).toMatch(/tente de novo/i);
  });
});
