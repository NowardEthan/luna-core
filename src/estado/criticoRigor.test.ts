import { describe, expect, it } from "vitest";
import { criticarRigor, blocoRevisaoRigor } from "./criticoRigor.js";
import type { ProvedorLlm, RequisicaoCompletacao, RespostaCompletacao } from "../providers/tipos.js";

function provedorFixo(conteudo: string | (() => Promise<RespostaCompletacao>)): ProvedorLlm {
  return {
    async completar(req: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      if (typeof conteudo === "function") return conteudo();
      return { conteudo, modelo: req.modelo, latencia_ms: 1 };
    },
  };
}

const input = { mensagemUsuario: "Moro em SJP. Faz um plano.", respostaRascunho: "Plano genérico sem local." };

describe("criticarRigor (camada 3 v2)", () => {
  it("parseia lacunas quando o crítico acha furo", async () => {
    const p = provedorFixo(JSON.stringify({ solido: false, lacunas: ["não citou mofo branco"] }));
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(false);
    expect(r.lacunas).toEqual(["não citou mofo branco"]);
  });

  it("aceita JSON cercado de texto (extrai o objeto)", async () => {
    const p = provedorFixo('Claro:\n{"solido": false, "lacunas": ["furo x"]}\nespero ter ajudado');
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(false);
    expect(r.lacunas).toEqual(["furo x"]);
  });

  it("solido=true quando não há lacunas", async () => {
    const p = provedorFixo(JSON.stringify({ solido: true }));
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(true);
    expect(r.lacunas).toEqual([]);
  });

  it("fail-safe: JSON inválido → solido:true (não bloqueia)", async () => {
    const p = provedorFixo("desculpa, não consegui avaliar");
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(true);
  });

  it("fail-safe: provedor lança → solido:true", async () => {
    const p = provedorFixo(async () => {
      throw new Error("rede caiu");
    });
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(true);
  });

  it("solido=false mas lacunas vazias é tratado como sólido (nada a revisar)", async () => {
    const p = provedorFixo(JSON.stringify({ solido: false, lacunas: [] }));
    const r = await criticarRigor(input, { provedor: p, modelo: "flash" });
    expect(r.solido).toBe(true);
  });
});

describe("blocoRevisaoRigor", () => {
  it("lista as lacunas como pontos a incorporar", () => {
    const bloco = blocoRevisaoRigor(["citar mofo branco", "considerar oídio"]);
    expect(bloco).toContain("• citar mofo branco");
    expect(bloco).toContain("• considerar oídio");
    expect(bloco).toContain("Revisão de rigor");
  });
});
