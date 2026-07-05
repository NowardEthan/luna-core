import { describe, expect, it } from "vitest";
import { simularVidaInterior } from "../src/mundo/vida/simuladorVida.js";
import {
  lerEstadoVida,
  listarEventosVida,
  resetarVidaParaTeste,
} from "../src/mundo/vida/storeVida.js";

describe("pkg-b — vida interior", () => {
  it("registra evento e atualiza estado em cenário de crise", () => {
    resetarVidaParaTeste();
    const r = simularVidaInterior("Estou em crise total hoje", {
      intencao: "apoio_emocional",
      nivel_risco: "alto",
    });
    expect(r.evento.tipo).toBe("crise");
    expect(r.estado.fase).toBe("recolhimento");
    const eventos = listarEventosVida(5);
    expect(eventos.length).toBeGreaterThan(0);
    const estado = lerEstadoVida();
    expect(estado.foco).toBe("acolhimento");
  });
});
