import { describe, expect, it } from "vitest";

import {
  medirConversa,
  medirEco,
  palavrasConteudo,
  parseConversaMd,
} from "./indiceEco.js";

/**
 * C0 (A Luna que Conversa): medir o eco SEMÂNTICO — o "extensão prolixa do que eu já contei".
 * O trigrama do detectores.ts não pega isso; estas métricas pegam.
 */

describe("palavrasConteudo", () => {
  it("tira stopwords e pontuação, guarda o conteúdo", () => {
    const p = palavrasConteudo("Que legal, um projeto de móveis pra marcenaria!");
    expect(p.has("projeto")).toBe(true);
    expect(p.has("moveis")).toBe(true); // sem acento
    expect(p.has("marcenaria")).toBe(true);
    expect(p.has("que")).toBe(false); // stopword
    expect(p.has("um")).toBe(false); // curta
  });
});

describe("medirEco", () => {
  it("ECO: reflete o conteúdo dele com pouco de novo → eco alto, aporte baixo", () => {
    const dele = "estou fazendo um projeto de móveis pra uma marcenaria, é mais simples";
    const eco = "que legal, um projeto de móveis pra marcenaria, mais simples mesmo né";
    const m = medirEco(eco, dele);
    expect(m.containment).toBeGreaterThan(0.5); // devolve o assunto dele
    expect(m.aporte).toBeLessThan(0.45); // traz pouco de novo
    expect(m.eco).toBeGreaterThan(0.55);
  });

  it("APORTE: traz stance/dado novo → aporte alto, eco baixo", () => {
    const dele = "estou fazendo um projeto de móveis pra uma marcenaria";
    const propria = "e o prazo tá apertado? o acabamento costuma travar tudo na reta final";
    const m = medirEco(propria, dele);
    expect(m.aporte).toBeGreaterThan(0.6);
    expect(m.eco).toBeLessThan(0.45);
    expect(m.recapAbertura).toBe(false);
  });

  it("RECAP de abertura: a 1ª frase espelha a fala dele", () => {
    const dele = "montei uma estante branca com as caixas de arquitetura e bauhaus";
    const resp = "ahh, a estante branca com as caixas de arquitetura e bauhaus! ficou linda";
    expect(medirEco(resp, dele).recapAbertura).toBe(true);
  });
});

describe("parseConversaMd", () => {
  it("separa Você/Luna do .md exportado", () => {
    const md = [
      "# Conversa",
      "*Exportado do Orbit*",
      "---",
      "**Você:**",
      "",
      "oi luna, boa noite",
      "",
      "**Luna:**",
      "",
      "boa noite! veio num pique bom?",
    ].join("\n");
    const turnos = parseConversaMd(md);
    expect(turnos).toEqual([
      { papel: "user", conteudo: "oi luna, boa noite" },
      { papel: "assistant", conteudo: "boa noite! veio num pique bom?" },
    ]);
  });
});

describe("medirConversa", () => {
  it("uma conversa com eco pontua mais alto que uma com aporte", () => {
    const relEco = medirConversa([
      { papel: "user", conteudo: "fiz um projeto de móveis pra marcenaria, mais simples" },
      { papel: "assistant", conteudo: "que legal, um projeto de móveis pra marcenaria mais simples mesmo" },
    ]);
    const relAporte = medirConversa([
      { papel: "user", conteudo: "fiz um projeto de móveis pra marcenaria, mais simples" },
      { papel: "assistant", conteudo: "e o cliente já bateu o martelo no prazo? isso muda tudo no acabamento" },
    ]);
    expect(relEco.turnosAvaliados).toBe(1);
    expect(relEco.ecoMedio).toBeGreaterThan(relAporte.ecoMedio);
    expect(relAporte.aporteMedio).toBeGreaterThan(relEco.aporteMedio);
  });
});
