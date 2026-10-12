import { describe, expect, it } from "vitest";

import { montarBlocoPresenca } from "../src/presenca/contextoPresenca.js";
import type { EstadoPresenca } from "../src/presenca/esquemaPresenca.js";

function estado(ambiente: EstadoPresenca["ambiente"]): EstadoPresenca {
  return {
    ambiente,
    status: "presente",
    atividade: "conversa_ativa",
    timestamp_entrada: new Date().toISOString(),
  };
}

describe("montarBlocoPresenca — localização atual", () => {
  it("descreve onde a Luna está agora", () => {
    const bloco = montarBlocoPresenca(estado("forge"));
    expect(bloco).toContain("Você está agora");
    expect(bloco).toContain("Forge");
  });

  it("usa o rótulo correto para o chat normal", () => {
    const bloco = montarBlocoPresenca(estado("desktop"));
    expect(bloco).toContain("Luna Chat");
  });

  it("reforça que ocupa um ambiente por vez", () => {
    const bloco = montarBlocoPresenca(estado("desktop"));
    expect(bloco).toContain("um ambiente por vez");
  });

  it("inclui o detalhe do ambiente (ex.: nome do workspace) quando fornecido", () => {
    const bloco = montarBlocoPresenca(estado("forge"), undefined, "projeto «Orbit»");
    expect(bloco).toContain("projeto «Orbit»");
  });

  it("sem transição não menciona mudança de lugar", () => {
    const bloco = montarBlocoPresenca(estado("forge"));
    expect(bloco).not.toContain("transitar");
  });
});

describe("montarBlocoPresenca — transição entre superfícies", () => {
  it("menciona a origem ao transitar do chat para o Forge", () => {
    const bloco = montarBlocoPresenca(estado("forge"), { de: "desktop" });
    expect(bloco).toContain("Luna Chat");
    expect(bloco).toContain("transitar");
  });

  it("ignora transição quando a origem é o mesmo ambiente", () => {
    const bloco = montarBlocoPresenca(estado("forge"), { de: "forge" });
    expect(bloco).not.toContain("transitar");
  });

  it("inclui o recap de continuidade quando fornecido", () => {
    const bloco = montarBlocoPresenca(estado("forge"), {
      de: "desktop",
      sessao_anterior_id: "s1",
      recap: "Usuário: como faço deploy?\nLuna: explicquei o fluxo de CI",
    });
    expect(bloco).toContain("deploy");
    expect(bloco).toContain("continuidade");
  });
});

describe("montarBlocoPresenca - suporte do Aster", () => {
  it("não leva transição nem recap da conversa anterior para o Aster", () => {
    const bloco = montarBlocoPresenca(estado("aster"), {
      de: "orbit_mobile",
      recap: "RECAP_PRIVADO_DO_ETHAN",
    });
    expect(bloco).toContain("Aster");
    expect(bloco).not.toContain("transitar");
    expect(bloco).not.toContain("RECAP_PRIVADO_DO_ETHAN");
  });

  it("não traz o atendimento do Aster de volta para o Ethan", () => {
    const bloco = montarBlocoPresenca(estado("orbit_mobile"), {
      de: "aster",
      recap: "RECAP_DO_MEMBRO",
    });
    expect(bloco).not.toContain("RECAP_DO_MEMBRO");
  });
});