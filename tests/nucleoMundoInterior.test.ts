import { describe, expect, it } from "vitest";

import { prepararNucleoMundoInterior } from "../src/mundo/montarNucleoMundoInterior.js";

describe("prepararNucleoMundoInterior", () => {
  it("sempre devolve humor, habitat e vida", () => {
    const nucleo = prepararNucleoMundoInterior({
      mensagem: "Oi lua, boa tarde",
      analise: { intencao: "conversa_casual", nivel_risco: "nenhum" },
      ambiente: "orbit_mobile",
    });

    expect(nucleo.humor).toMatch(/Estado da Luna|Como agir neste turno|Presença viva/);
    expect(nucleo.habitat).toMatch(/conversa no celular/);
    expect(nucleo.vida).toMatch(/Vida interior neste turno|Fase:|Vontade narrativa/);
  });
});
