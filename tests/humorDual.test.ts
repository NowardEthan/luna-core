import { describe, expect, it } from "vitest";

import type { AnaliseContexto } from "../src/analyzers/esquema.js";
import { atualizarHumor } from "../src/mundo/humor/atualizadorHumor.js";
import { resetarClimaGlobal } from "../src/mundo/humor/climaHumor.js";
import { lerRelacaoHumor, resetarRelacaoHumor } from "../src/mundo/humor/relacaoHumor.js";

const ANALISE_CASUAL: AnaliseContexto = {
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  envolve_ferramenta: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.9,
  motivos: ["teste"],
};

describe("humor dual-layer", () => {
  it("insulto uid_A não fecha uid_B", () => {
    const uidA = `uid_A_${Date.now()}`;
    const uidB = `uid_B_${Date.now()}`;

    resetarClimaGlobal();
    resetarRelacaoHumor(uidA);
    resetarRelacaoHumor(uidB);

    atualizarHumor(ANALISE_CASUAL, 0, uidA, "você é inútil, cala a boca");

    const relA = lerRelacaoHumor(uidA);
    const relB = lerRelacaoHumor(uidB);

    expect(["reticente", "fechada"]).toContain(relA.disposicao);
    expect(relB.disposicao).toBe("aberta");
  });
});
