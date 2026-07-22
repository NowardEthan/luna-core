import { describe, expect, it } from "vitest";
import {
  conciliarRevisao,
  distanciaEdicao,
  perguntaPedePrecisao,
  tokensDePrecisao,
} from "./descreverImagemOpenRouter.js";

/**
 * A revisão de segunda opinião contra a confabulação de números/placas.
 *
 * O bug: o modelo lê a placa que não dá para ler e AFIRMA um valor errado. A revisão só
 * deixa passar com confiança o que um segundo modelo leu IGUAL; o resto vira "incerto".
 */

describe("perguntaPedePrecisao", () => {
  it("liga para pergunta sobre número/placa/o que está escrito", () => {
    expect(perguntaPedePrecisao("qual a placa do ônibus?")).toBe(true);
    expect(perguntaPedePrecisao("consegue ler o que está escrito aí?")).toBe(true);
    expect(perguntaPedePrecisao("qual o placar no canto?")).toBe(true);
    expect(perguntaPedePrecisao("tá quanto o preço?")).toBe(true);
  });

  it("fica quieta para pergunta visual genérica (não paga o custo da 2ª leitura)", () => {
    expect(perguntaPedePrecisao("que cor é o fundo?")).toBe(false);
    expect(perguntaPedePrecisao("descreve a cena pra mim")).toBe(false);
    expect(perguntaPedePrecisao(undefined)).toBe(false);
  });
});

describe("tokensDePrecisao", () => {
  it("captura placas (com ou sem espaço) e números, ignora palavras puras", () => {
    const t = tokensDePrecisao("A placa é MX07JNO e a outra WJ07 UNQ, frota 316. Country Bus.");
    expect(t.has("MX07JNO")).toBe(true);
    expect(t.has("WJ07UNQ")).toBe(true); // junta a placa quebrada por espaço
    expect(t.has("316")).toBe(true);
    expect(t.has("COUNTRY")).toBe(false); // palavra sem dígito não é token de precisão
  });
});

describe("distanciaEdicao", () => {
  it("conta 1 substituição e 1 transposição de vizinhos como 1", () => {
    expect(distanciaEdicao("YJ56WVH", "YJ56WVH")).toBe(0);
    expect(distanciaEdicao("YJ56WVH", "YJ56NVH")).toBe(1); // substituição
    expect(distanciaEdicao("YJ56WVH", "YJ56VWH")).toBe(1); // transposição W↔V
    expect(distanciaEdicao("MX07JNO", "WJ07UNQ")).toBeGreaterThan(1); // chute divergente
  });
});

describe("conciliarRevisao", () => {
  it("não penaliza quando a 2ª leitura confirma tudo", () => {
    const r = conciliarRevisao("Frota 316, placa YJ56WVH.", "Vejo 316 e a placa YJ56 WVH.");
    expect(r.naoConfirmados).toEqual([]);
    expect(r.provaveis).toEqual([]);
    expect(r.texto).not.toMatch(/REVISÃO DA VISÃO/);
  });

  it("marca como INCERTO (não afirma) o que a 2ª leitura leu bem diferente", () => {
    // principal chutou WJ07UNQ; a revisão leu outra coisa (diverge) → incerto.
    const r = conciliarRevisao(
      "Placa do fundo: WJ07UNQ; frota 310.",
      "A placa do fundo está ilegível; frota 310.",
    );
    expect(r.naoConfirmados).toContain("WJ07UNQ");
    expect(r.naoConfirmados).not.toContain("310"); // 310 os dois leram
    expect(r.texto).toMatch(/N[ÃA]O afirme/i);
  });

  it("marca como PROVÁVEL (parece, sem cravar) placa que bateu quase — 1 caractere", () => {
    // primário leu certo (YJ56WVH); revisor errou por 1 caractere (YJ56NVH) → não esconde.
    const r = conciliarRevisao("Placa: YJ56WVH; frota 316.", "Placa YJ56 NVH; frota 316.");
    expect(r.provaveis).toContain("YJ56WVH");
    expect(r.naoConfirmados).not.toContain("YJ56WVH");
    expect(r.texto).toMatch(/PARECE/i);
  });
});
