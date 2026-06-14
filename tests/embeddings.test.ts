import { test, expect } from "vitest";
import { obterMotorEmbeddings } from "../src/memoria/longa/motorEmbeddings.js";
import { calcularCosineSimilarity } from "../src/memoria/longa/cosineSimilarity.js";

test("deve calcular cosine similarity corretamente", () => {
  const vecA = [1, 0, 0];
  const vecB = [1, 0, 0];
  const vecC = [0, 1, 0];
  const vecD = [-1, 0, 0];

  expect(calcularCosineSimilarity(vecA, vecB)).toBeCloseTo(1, 5);
  expect(calcularCosineSimilarity(vecA, vecC)).toBeCloseTo(0, 5);
  expect(calcularCosineSimilarity(vecA, vecD)).toBeCloseTo(-1, 5);
});

// Nota: pular esse teste no CI ou usar um mock, pois o modelo local pode baixar ~20MB
test.skip("deve gerar embeddings com a mesma dimensionalidade", async () => {
  const motor = obterMotorEmbeddings();
  const v1 = await motor.gerarEmbedding("Gosto de maçã");
  const v2 = await motor.gerarEmbedding("Odeio banana");

  expect(v1.length).toBeGreaterThan(0);
  expect(v1.length).toBe(v2.length);

  const score1 = calcularCosineSimilarity(v1, v1);
  expect(score1).toBeCloseTo(1, 2);
}, 20000);
