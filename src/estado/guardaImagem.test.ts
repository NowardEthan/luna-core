import { describe, expect, it } from "vitest";

import {
  confabulouImagem,
  pediuImagem,
  respostaAlegaImagemEnviada,
  textoDesculpaImagem,
  vazouPseudoToolImagem,
} from "./guardaImagem.js";

describe("guardaImagem", () => {
  it("reconhece pedido de desenho", () => {
    expect(pediuImagem("desenha um gato fofo")).toBe(true);
    expect(pediuImagem("gera uma imagem de um quarto")).toBe(true);
    expect(pediuImagem("bom dia luna")).toBe(false);
  });

  it("reconhece alegacao de envio", () => {
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

  it("bloqueia pseudo-tool de imagem vazada mesmo em continuacao", () => {
    const resposta =
      'Feito! Mandei gerar.\n[Tool: gen_images]{"queries":["cute baby t-rex"]}';

    expect(vazouPseudoToolImagem(resposta)).toBe(true);
    expect(confabulouImagem(resposta, 0, "Sim por favor")).toBe(true);
    expect(confabulouImagem(resposta, 1, "Sim por favor")).toBe(false);
  });

  it("desculpa e honesta e curta", () => {
    expect(textoDesculpaImagem()).toMatch(/tentei desenhar/i);
    expect(textoDesculpaImagem()).toMatch(/tente de novo/i);
  });
});
