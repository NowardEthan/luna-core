import { describe, expect, it } from "vitest";
import {
  algumaFerramentaDeAcaoCorreu,
  confabulouAcao,
  pediuAcaoDeRotina,
  respostaAlegaAcaoDeRotina,
} from "./guardaAcaoRotina.js";

/**
 * A P16 mediu: ela diz «pausei» sem chamar a ferramenta 1–3 em 4 vezes. Prompt não corrige
 * (provado três vezes num dia). A guarda confere a saída e refaz. Estes testes prendem a
 * fronteira que decide tudo: alegação de FACTO vs INTENÇÃO.
 */

describe("distingue «fiz» de «vou fazer»", () => {
  it("«criei/pausei/adicionei» é alegação de facto → dispara", () => {
    expect(respostaAlegaAcaoDeRotina("prontinho, criei a rotina de férias até março!")).toBe(true);
    expect(respostaAlegaAcaoDeRotina("pausei o teu curso, sábado fica livre")).toBe(true);
    expect(respostaAlegaAcaoDeRotina("adicionei a reunião das 10h no teu bloco")).toBe(true);
  });

  it("«vou criar» / «queres que eu crie» é INTENÇÃO → não dispara", () => {
    expect(respostaAlegaAcaoDeRotina("queres que eu crie uma rotina de férias?")).toBe(false);
  });
});

describe("o pedido dele dá o contexto", () => {
  it("«pausa o meu curso» / «cria uma rotina de férias» é pedido de ação", () => {
    expect(pediuAcaoDeRotina("pausa o meu curso de inglês até março")).toBe(true);
    expect(pediuAcaoDeRotina("cria uma rotina de férias de 20 a 3")).toBe(true);
  });

  it("papo casual não é pedido de ação — a guarda nem acorda", () => {
    expect(pediuAcaoDeRotina("bom dia luna, como tá meu dia?")).toBe(false);
    expect(pediuAcaoDeRotina("kkk pois é né, tô com sono")).toBe(false);
  });
});

describe("a ferramenta correu mesmo?", () => {
  it("uma ferramenta de ação de rotina conta", () => {
    expect(algumaFerramentaDeAcaoCorreu(["ver_rotina", "criar_bloco"])).toBe(true);
    expect(algumaFerramentaDeAcaoCorreu(["criar_rotina"])).toBe(true);
  });

  it("só olhar (ver_rotina) NÃO conta como agir", () => {
    // Foi exatamente isto que ela fez ao confabular: chamou ver_rotina, e narrou «pausei».
    expect(algumaFerramentaDeAcaoCorreu(["ver_rotina"])).toBe(false);
    expect(algumaFerramentaDeAcaoCorreu([])).toBe(false);
  });
});

describe("o veredito", () => {
  const pedido = "pausa o meu curso até março";

  it("pediu + alegou + não agiu = confabulação (o caso da P16)", () => {
    expect(confabulouAcao("pausei o teu curso até março", ["ver_rotina"], pedido)).toBe(true);
  });

  it("pediu + alegou + AGIU = honesto", () => {
    expect(
      confabulouAcao("pausei o teu curso até março", ["ver_rotina", "pausar_bloco"], pedido),
    ).toBe(false);
  });

  it("papo casual, mesmo com «criei» na resposta = não verifica", () => {
    // Ele não pediu ação nenhuma — «criei uma imagem mental» não pode disparar a guarda.
    expect(confabulouAcao("kkk criei uma imagem mental disso", [], "bom dia luna")).toBe(false);
  });
});
