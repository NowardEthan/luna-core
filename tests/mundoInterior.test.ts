import { describe, expect, it } from "vitest";
import { classificarProfundidade } from "../src/estado/talamoPipeline.js";
import { aplicarDecaimento, clampHumor, HUMOR_BASELINE } from "../src/mundo/humor/esquemaHumor.js";
import { validarHonestidadeDiario } from "../src/mundo/diario/storeDiario.js";

describe("talamoPipeline M2", () => {
  it("'lembra?' não é classificado como simples", () => {
    expect(classificarProfundidade("lembra?")).not.toBe("simples");
  });

  it("'ok' continua simples", () => {
    expect(classificarProfundidade("ok")).toBe("simples");
  });
});

describe("humor M5", () => {
  it("clamp respeita limites", () => {
    const e = clampHumor({
      valencia: 2,
      energia: -1,
      proximidade: 0.5,
      atualizado_em: new Date().toISOString(),
    });
    expect(e.valencia).toBe(1);
    expect(e.energia).toBe(0);
  });

  it("decaimento converge ao baseline após 12h", () => {
    const estado = {
      valencia: 0.8,
      energia: 0.9,
      proximidade: 0.9,
      atualizado_em: new Date(Date.now() - 12 * 3_600_000).toISOString(),
    };
    const d = aplicarDecaimento(estado);
    expect(Math.abs(d.valencia - HUMOR_BASELINE.valencia)).toBeLessThan(0.35);
  });
});

describe("diário M4 — honestidade", () => {
  it("remove frase com léxico proibido", () => {
    const limpo = validarHonestidadeDiario("Hoje foi leve. Sofri muito ontem. Ele saiu animado.");
    expect(limpo).not.toMatch(/sofri/i);
    expect(limpo).toContain("leve");
  });
});

describe("imports M5 — fronteira", () => {
  it("humor não é importado em decision/", () => {
    const { readFileSync, readdirSync } = require("node:fs") as typeof import("node:fs");
    const { join, dirname } = require("node:path") as typeof import("node:path");
    const { fileURLToPath } = require("node:url") as typeof import("node:url");
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/decision");
    const arquivos = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of arquivos) {
      const txt = readFileSync(join(dir, f), "utf-8");
      expect(txt).not.toMatch(/mundo\/humor/);
    }
  });
});
