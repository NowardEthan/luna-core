import { describe, expect, it } from "vitest";

import { mapearErroUsuario } from "./mapearErroUsuario.js";

describe("mapearErroUsuario — rate_limited ≠ cota", () => {
  it("429 rate_limited não vira mensagem de plano", () => {
    const mapped = mapearErroUsuario({
      status: 429,
      code: "rate_limited",
      error: "Calma — tô recebendo rápido demais agora. Espera uns segundos e manda de novo.",
    });
    expect(mapped.codigo).toBe("rate_limited");
    expect(mapped.categoria).toBe("rate_limit");
    expect(mapped.mensagem.toLowerCase()).not.toContain("plano");
    expect(mapped.recuperavel).toBe(true);
  });

  it("429 quota_exceeded continua na categoria quota", () => {
    const mapped = mapearErroUsuario({
      status: 429,
      code: "quota_exceeded",
      quotaKind: "messages",
      error: "Limite do plano",
    });
    expect(mapped.codigo).toBe("quota_exceeded_messages");
    expect(mapped.categoria).toBe("quota");
  });
});
