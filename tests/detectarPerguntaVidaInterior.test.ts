import { describe, expect, it } from "vitest";

import {
  detectarPerguntaVidaInterior,
  formatarGuiaRespostaVidaInterior,
} from "../src/mundo/vida/detectarPerguntaVidaInterior.js";

describe("detectarPerguntaVidaInterior", () => {
  it("detecta perguntas sobre o dia ou a vida da Luna", () => {
    expect(detectarPerguntaVidaInterior("Oq fez de bom hoje?")).toBe(true);
    expect(detectarPerguntaVidaInterior("como foi seu dia?")).toBe(true);
    expect(detectarPerguntaVidaInterior("me conta sobre sua vida")).toBe(true);
    expect(detectarPerguntaVidaInterior("Oi lua")).toBe(false);
  });

  it("guia de resposta proíbe órbita literal", () => {
    expect(formatarGuiaRespostaVidaInterior()).toMatch(/órbita/i);
    expect(formatarGuiaRespostaVidaInterior()).toMatch(/Vida interior/);
  });
});
