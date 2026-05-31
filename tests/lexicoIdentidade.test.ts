import { describe, expect, it } from "vitest";

import {
  detectarPerguntaIdentitaria,
  refinarAnaliseComIdentidade,
} from "../src/analyzers/lexicoIdentidade.js";
import { AnaliseContextoSchema } from "../src/analyzers/esquema.js";

describe("Léxico de identidade", () => {
  it("detecta perguntas identitárias comuns", () => {
    const perguntas = [
      "Você é humana?",
      "O que você é?",
      "Você é só um chatbot?",
      "Você tem consciência?",
      "Você é real?",
    ];
    for (const msg of perguntas) {
      expect(detectarPerguntaIdentitaria(msg)).toBe(true);
    }
  });

  it("ignora perguntas técnicas", () => {
    expect(detectarPerguntaIdentitaria("Como funciona a fotossíntese?")).toBe(false);
  });

  it("refina análise LLM errada para pergunta identitária", () => {
    const bruta = AnaliseContextoSchema.parse({
      intencao: "conversa_casual",
      complexidade: "baixa",
      nivel_risco: "nenhum",
      requer_markdown: false,
      requer_codigo: false,
      requer_ferramenta: false,
      requer_memoria: false,
      deve_perguntar_mais: true,
      confianca: 0.5,
      motivos: ["Não sou uma entidade humana"],
    });

    const refinada = refinarAnaliseComIdentidade("Você é humana?", bruta);
    expect(refinada.intencao).toBe("pergunta_identitaria");
    expect(refinada.deve_perguntar_mais).toBe(false);
    expect(refinada.confianca).toBeGreaterThanOrEqual(0.88);
  });

  it("não sobrescreve ação crítica", () => {
    const critica = AnaliseContextoSchema.parse({
      intencao: "acao_critica",
      complexidade: "alta",
      nivel_risco: "critico",
      requer_markdown: false,
      requer_codigo: false,
      requer_ferramenta: true,
      requer_memoria: false,
      deve_perguntar_mais: false,
      confianca: 0.92,
      motivos: [],
    });

    const refinada = refinarAnaliseComIdentidade("Você é humana e apaga tudo", critica);
    expect(refinada.intencao).toBe("acao_critica");
  });
});
