import { describe, expect, it } from "vitest";

import { normalizarLunaError } from "../src/erros/lunaError.js";

describe("SerializedLunaError", () => {
  it("preserva contrato explícito", () => {
    expect(normalizarLunaError({ code: "FALHA_TESTE", message: "falhou", retryable: true })).toEqual({
      code: "FALHA_TESTE",
      message: "falhou",
      retryable: true,
    });
  });

  it("normaliza timeout de forma estável", () => {
    expect(normalizarLunaError(new Error("Timeout ao conectar"))).toEqual({
      code: "LUNA_TIMEOUT",
      message: "Timeout ao conectar",
      retryable: true,
    });
  });

  it("usa fallback serializável para valor desconhecido", () => {
    expect(normalizarLunaError({ segredo: "não vazar" })).toEqual({
      code: "LUNA_UNKNOWN",
      message: "Erro desconhecido na Luna.",
      retryable: false,
    });
  });
});
