import { describe, expect, it } from "vitest";

import {
  calcularSaliencia,
  calcularScoreRetrieval,
} from "../src/memoria/longa/calculadorSaliencia.js";

// ─── calcularSaliencia — scores por tipo ─────────────────────────────────────

describe("calcularSaliencia — hierarquia de tipos", () => {
  it("dado sensível confirmado tem score mais alto", () => {
    const s = calcularSaliencia({
      tipo: "informacao_sensivel",
      sensibilidade: "sensivel",
      visibilidade_uso: "nunca_mencionar_sem_confirmacao",
      fonte_confirmacao: "confirmacao_usuario",
      confianca: 1.0,
    });
    expect(s.score).toBeGreaterThan(0.85);
  });

  it("preferência confirmada tem score alto", () => {
    const s = calcularSaliencia({
      tipo: "preferencia",
      sensibilidade: "pessoal",
      visibilidade_uso: "mencionar_quando_relevante",
      fonte_confirmacao: "confirmacao_usuario",
      confianca: 1.0,
    });
    expect(s.score).toBeGreaterThan(0.75);
  });

  it("fato geral de reflexão tem score médio", () => {
    const s = calcularSaliencia({
      tipo: "fato_geral",
      sensibilidade: "normal",
      visibilidade_uso: "mencionar_se_perguntado",
      fonte_confirmacao: "inferencia_reflexao",
      confianca: 0.7,
    });
    expect(s.score).toBeGreaterThan(0.3);
    expect(s.score).toBeLessThan(0.75);
  });

  it("sensível > preferência > fato_geral (ordem de saliência)", () => {
    const sensivel = calcularSaliencia({
      tipo: "informacao_sensivel",
      sensibilidade: "sensivel",
      visibilidade_uso: "silenciosa",
      fonte_confirmacao: "confirmacao_usuario",
    });
    const preferencia = calcularSaliencia({
      tipo: "preferencia",
      sensibilidade: "pessoal",
      visibilidade_uso: "mencionar_quando_relevante",
      fonte_confirmacao: "confirmacao_usuario",
    });
    const fato = calcularSaliencia({
      tipo: "fato_geral",
      sensibilidade: "normal",
      visibilidade_uso: "mencionar_se_perguntado",
      fonte_confirmacao: "inferencia_reflexao",
    });

    expect(sensivel.score).toBeGreaterThan(preferencia.score);
    expect(preferencia.score).toBeGreaterThan(fato.score);
  });

  it("score nunca ultrapassa 1.0", () => {
    const s = calcularSaliencia({
      tipo: "confirmacao_usuario",
      sensibilidade: "sensivel",
      visibilidade_uso: "nunca_mencionar_sem_confirmacao",
      fonte_confirmacao: "confirmacao_usuario",
      confianca: 1.0,
      utilidade_futura: "alta",
    });
    expect(s.score).toBeLessThanOrEqual(1.0);
  });

  it("score nunca cai abaixo de 0.1", () => {
    const s = calcularSaliencia({
      tipo: "recall",
      sensibilidade: "normal",
      visibilidade_uso: "mencionar_se_perguntado",
      fonte_confirmacao: "inferencia_reflexao",
      confianca: 0.1,
      utilidade_futura: "baixa",
    });
    expect(s.score).toBeGreaterThanOrEqual(0.1);
  });
});

// ─── calcularSaliencia — efeito de utilidade_futura ──────────────────────────

describe("calcularSaliencia — efeito de utilidade_futura", () => {
  const base = {
    tipo: "fato_geral",
    sensibilidade: "normal" as const,
    visibilidade_uso: "mencionar_se_perguntado",
    fonte_confirmacao: "inferencia_reflexao",
    confianca: 0.8,
  };

  it("utilidade_futura=alta aumenta score", () => {
    const com = calcularSaliencia({ ...base, utilidade_futura: "alta" });
    const sem = calcularSaliencia(base);
    expect(com.score).toBeGreaterThan(sem.score);
  });

  it("utilidade_futura=baixa reduz score", () => {
    const com = calcularSaliencia({ ...base, utilidade_futura: "baixa" });
    const sem = calcularSaliencia(base);
    expect(com.score).toBeLessThan(sem.score);
  });
});

// ─── calcularSaliencia — confirmacao_usuario vs inferencia ────────────────────

describe("calcularSaliencia — fonte de confirmação", () => {
  const base = {
    tipo: "preferencia" as const,
    sensibilidade: "pessoal" as const,
    visibilidade_uso: "mencionar_quando_relevante",
  };

  it("confirmacao_usuario > inferencia_reflexao", () => {
    const confirmado = calcularSaliencia({
      ...base,
      fonte_confirmacao: "confirmacao_usuario",
    });
    const inferido = calcularSaliencia({
      ...base,
      fonte_confirmacao: "inferencia_reflexao",
    });
    expect(confirmado.score).toBeGreaterThan(inferido.score);
  });
});

// ─── calcularScoreRetrieval — ranking ponderado ───────────────────────────────

describe("calcularScoreRetrieval — saliência como boost no ranking", () => {
  it("fórmula: cosine*0.75 + saliencia*0.25", () => {
    expect(calcularScoreRetrieval(0.8, 0.6)).toBeCloseTo(0.75, 2);
    expect(calcularScoreRetrieval(0.6, 0.8)).toBeCloseTo(0.65, 2);
  });

  it("memória alta saliência supera memória recente de baixa saliência", () => {
    // Dois fatos com cosine similar — saliência decide
    const cosineSimilar = 0.62;
    const scoreAltaSaliencia = calcularScoreRetrieval(cosineSimilar, 0.95);
    const scoreBaixaSaliencia = calcularScoreRetrieval(cosineSimilar, 0.40);
    expect(scoreAltaSaliencia).toBeGreaterThan(scoreBaixaSaliencia);
  });

  it("cosine ainda domina — saliência não inverte ranking com cosine muito diferente", () => {
    const altoCosineBaixaSaliencia = calcularScoreRetrieval(0.90, 0.20);
    const baixoCosineAltaSaliencia = calcularScoreRetrieval(0.30, 1.00);
    expect(altoCosineBaixaSaliencia).toBeGreaterThan(baixoCosineAltaSaliencia);
  });

  it("score total entre 0 e 1 para inputs válidos", () => {
    const score = calcularScoreRetrieval(0.5, 0.5);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
