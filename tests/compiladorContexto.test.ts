import { describe, expect, it } from "vitest";
import { compilarContexto } from "../src/contexto/compiladorContexto.js";

describe("compiladorContexto", () => {
  it("política nunca é cortada", () => {
    const longa = "x".repeat(5000);
    const r = compilarContexto(
      {
        politica: "Bloqueio ativo.",
        sense: longa,
        memorias_longas: longa,
      },
      100,
    );
    expect(r.briefing).toContain("Política ativa");
    expect(r.briefing).toContain("Bloqueio ativo");
    expect(r.cortes.length).toBeGreaterThan(0);
  });

  it("respeita orçamento global", () => {
    const r = compilarContexto(
      {
        politica: "ok",
        kernel: "a".repeat(2000),
        sense: "b".repeat(2000),
      },
      300,
    );
    expect(r.tokens_estimados).toBeLessThanOrEqual(320);
  });

  it("inclui identidade protegida no briefing", () => {
    const r = compilarContexto(
      {
        politica: "ok",
        identidade: "Quem é Luna: presença conversacional.",
        sense: "x".repeat(5000),
      },
      100,
    );
    expect(r.briefing).toContain("Identidade");
    expect(r.briefing).toContain("Quem é Luna");
    expect(r.cortes).not.toContain("identidade");
  });
});
