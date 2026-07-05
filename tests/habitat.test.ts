import { describe, expect, it } from "vitest";
import {
  definirHabitatAtual,
  listarAmbientesHabitat,
  obterEstadoHabitat,
  obterSliceHabitatAtual,
  resetarHabitat,
} from "../src/mundo/habitat/storeHabitat.js";
import { montarEntradasCompilador } from "../src/contexto/montarEntradasCompilador.js";
import type { PoliticaDecisao } from "../src/analyzers/esquema.js";

const politicaBase: PoliticaDecisao = {
  modo: "teste",
  acao: "responder",
  formato: "texto_simples",
  markdown_permitido: true,
  nivel_formato_md: "nenhum",
  tom: "tecnico_acolhedor",
  autonomia: "executar",
  acao_memoria: "nenhuma",
  nivel_seguranca: "nenhum",
  diretrizes_ativas: [],
};

describe("pkg-m — habitat", () => {
  it("lista seed de ambientes e mantém status", () => {
    const ambientes = listarAmbientesHabitat();
    expect(ambientes.length).toBeGreaterThan(1);
    definirHabitatAtual(ambientes[1].id);
    const { ambiente } = obterEstadoHabitat();
    expect(ambiente.id).toBe(ambientes[1].id);
    resetarHabitat();
  });

  it("injeta slice de habitat no compilador quando presente", () => {
    const habitat = obterSliceHabitatAtual();
    const entradas = montarEntradasCompilador({
      politica: politicaBase,
      habitat,
    });
    expect(entradas.habitat).toContain("Habitat atual");
    expect(entradas.identidade).toBeTruthy();
  });
});
