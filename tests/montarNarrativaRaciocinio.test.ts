import { describe, expect, it } from "vitest";
import { montarNarrativaRaciocinio } from "../src/pipeline/montarNarrativaRaciocinio.js";

describe("montarNarrativaRaciocinio", () => {
  it("gera parágrafo legível a partir do trace PAIA", () => {
    const texto = montarNarrativaRaciocinio({
      intencao: "conversa_casual",
      complexidade: "baixa",
      nivelRisco: "nenhum",
      politicaAcao: "responder",
      politicaTom: "casual",
      memoriaAcao: "ignorar",
      memoriaMotivo: "conversa casual sem dado persistente",
    });

    expect(texto).toContain("Percebi");
    expect(texto).toContain("saudação ou conversa casual");
    expect(texto).toContain("sem risco relevante");
    expect(texto).toContain("Vou responder");
    expect(texto).toContain("Não vou guardar nada na memória");
    expect(texto).toContain("conversa casual sem dado persistente");
  });
});
