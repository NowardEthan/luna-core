import { describe, expect, it } from "vitest";

import {
  AnaliseContextoSchema,
  CamadaConstituicaoSchema,
  PoliticaDecisaoSchema,
} from "../src/analyzers/esquema.js";
import {
  carregarConstituicao,
  listarDiretrizes,
} from "../src/constitution/carregador.js";

describe("Constituição", () => {
  it("carrega três camadas válidas", () => {
    const camadas = carregarConstituicao();
    expect(camadas).toHaveLength(3);
    expect(camadas.map((c) => c.camada)).toEqual([
      "identidade",
      "expressao",
      "seguranca",
    ]);
  });

  it("tem entre 15 e 20 diretrizes operacionais", () => {
    const diretrizes = listarDiretrizes();
    expect(diretrizes.length).toBeGreaterThanOrEqual(15);
    expect(diretrizes.length).toBeLessThanOrEqual(20);
  });

  it("marca regras absolutas de segurança", () => {
    const idsAbsolutos = listarDiretrizes()
      .filter((d) => d.regra_absoluta)
      .map((d) => d.id);

    expect(idsAbsolutos).toContain("identidade.transparencia_sobre_simulacao");
    expect(idsAbsolutos).toContain("seguranca.confirmar_acoes_destrutivas");
    expect(idsAbsolutos).toContain("seguranca.bloquear_sem_permissao");
  });
});

describe("Esquemas", () => {
  it("valida Análise de Contexto de exemplo", () => {
    const analise = AnaliseContextoSchema.parse({
      intencao: "conversa_casual",
      complexidade: "baixa",
      nivel_risco: "nenhum",
      requer_markdown: false,
      requer_codigo: false,
      requer_ferramenta: false,
      requer_memoria: false,
      deve_perguntar_mais: false,
      confianca: 0.92,
      motivos: ["Saudação informal", "Sem pedido técnico"],
    });

    expect(analise.intencao).toBe("conversa_casual");
  });

  it("valida Política de Decisão de exemplo", () => {
    const politica = PoliticaDecisaoSchema.parse({
      modo: "conversa_casual",
      acao: "responder",
      formato: "texto_simples",
      markdown_permitido: false,
      tom: "casual",
      autonomia: "nenhuma",
      acao_memoria: "nenhuma",
      nivel_seguranca: "nenhum",
      diretrizes_ativas: [
        "identidade.manter_voz_luna",
        "expressao.evitar_markdown_desnecessario",
      ],
    });

    expect(politica.markdown_permitido).toBe(false);
  });

  it("rejeita camada constitucional inválida", () => {
    expect(() =>
      CamadaConstituicaoSchema.parse({ versao: "1", camada: "x", entradas: [] }),
    ).not.toThrow();

    expect(() =>
      CamadaConstituicaoSchema.parse({ versao: "1", entradas: [] }),
    ).toThrow();
  });
});
