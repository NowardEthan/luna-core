import { describe, expect, it } from "vitest";

import type { ProvedorLlm } from "../providers/tipos.js";
import { julgarAporte, julgarConversa } from "./juizAporte.js";

/** Provedor mock — devolve JSONs enlatados, sem tocar na rede. */
function mock(respostas: string[]): ProvedorLlm {
  let i = 0;
  return {
    completar: async () => ({
      conteudo: respostas[Math.min(i++, respostas.length - 1)]!,
      modelo: "mock",
      latencia_ms: 1,
    }),
  };
}

describe("julgarAporte", () => {
  it("parseia o veredito do juiz", async () => {
    const p = mock([
      JSON.stringify({ aporte: 0.1, movimento: "decorar", motivo: "só enfeitou o assunto dele" }),
    ]);
    const r = await julgarAporte("fiz um projeto de móveis", "que legal, projeto de móveis é bacana...", p, "m");
    expect(r?.movimento).toBe("decorar");
    expect(r?.aporte).toBeLessThan(0.3);
  });

  it("devolve null quando o modelo cospe lixo", async () => {
    const p = mock(["isto não é json nenhum"]);
    expect(await julgarAporte("oi", "oi", p, "m")).toBeNull();
  });

  it("devolve null quando o JSON viola o schema (aporte fora de 0..1)", async () => {
    const p = mock([JSON.stringify({ aporte: 5, movimento: "stance", motivo: "x" })]);
    expect(await julgarAporte("oi", "oi", p, "m")).toBeNull();
  });
});

describe("julgarConversa", () => {
  it("agrega aporte médio e distribuição de movimentos", async () => {
    const p = mock([
      JSON.stringify({ aporte: 0.1, movimento: "decorar", motivo: "x" }),
      JSON.stringify({ aporte: 0.8, movimento: "stance", motivo: "y" }),
    ]);
    const rel = await julgarConversa(
      [
        { papel: "user", conteudo: "a" },
        { papel: "assistant", conteudo: "b" },
        { papel: "user", conteudo: "c" },
        { papel: "assistant", conteudo: "d" },
      ],
      p,
      "m",
    );
    expect(rel.turnosAvaliados).toBe(2);
    expect(rel.distribuicao.decorar).toBe(1);
    expect(rel.distribuicao.stance).toBe(1);
    expect(rel.aporteMedio).toBeCloseTo(0.45, 1);
  });
});
