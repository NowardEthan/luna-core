import { describe, expect, it } from "vitest";

import { mapearErroParaEventoSse, mapearErroUsuario } from "../src/ux/mapearErroUsuario.js";

describe("pkg-ux — mapeamento de erros", () => {
  it("mapeia erro de quota de mensagens", () => {
    const mapped = mapearErroUsuario({
      message: "Limite atingido",
      code: "quota_exceeded",
      status: 429,
      quotaKind: "messages",
    });

    expect(mapped.codigo).toBe("quota_exceeded_messages");
    expect(mapped.categoria).toBe("quota");
    expect(mapped.recuperavel).toBe(true);
    expect(mapped.mensagem).toContain("limite de mensagens");
  });

  it("mapeia timeout de streaming para aviso amigável", () => {
    const mapped = mapearErroUsuario(new Error("Timeout de streaming (120s)."));
    expect(mapped.codigo).toBe("timeout");
    expect(mapped.gravidade).toBe("aviso");
    expect(mapped.sugestao).toBeTruthy();
  });

  it("gera evento SSE estruturado", () => {
    const evt = mapearErroParaEventoSse({
      error: "Autenticação Firebase obrigatória.",
      status: 401,
    });
    expect(evt).toMatchObject({
      code: "auth_obrigatoria",
      category: "autenticacao",
      severity: "erro",
    });
    expect(typeof evt.error).toBe("string");
  });

  it("usa fallback quando não encontra correspondência", () => {
    const mapped = mapearErroUsuario({ message: "Falha totalmente inédita xyz" });
    expect(mapped.codigo).toBe("erro_desconhecido");
    expect(mapped.mensagem).toBeTruthy();
  });
});
