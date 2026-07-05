import { describe, expect, it } from "vitest";

import {
  coletarSliceEcossistema,
  deveAtivarNeuronioEcossistema,
} from "../src/neuronios/especialistas/neuronioEcossistema.js";

describe("neuronioEcossistema", () => {
  it("ativa apenas para intenções de arquitetura/ecossistema/produto", () => {
    expect(deveAtivarNeuronioEcossistema("pergunta_arquitetura")).toBe(true);
    expect(deveAtivarNeuronioEcossistema("pergunta_ecossistema")).toBe(true);
    expect(deveAtivarNeuronioEcossistema("pergunta_produto")).toBe(true);
    expect(deveAtivarNeuronioEcossistema("conversa_casual")).toBe(false);
  });

  it("coleta conhecimento canônico quando a intenção permite", async () => {
    const slice = await coletarSliceEcossistema({
      mensagem: "Como funciona a arquitetura PAIA no ecossistema Luna?",
      intencao: "pergunta_arquitetura",
    });

    expect(slice).toBeTruthy();
    expect(slice).toContain("Resumo do ecossistema");
    expect(slice).toContain("Expansão canônica");
  });

  it("não coleta quando a intenção não é de ecossistema", async () => {
    const slice = await coletarSliceEcossistema({
      mensagem: "Tudo bem por aí?",
      intencao: "conversa_casual",
    });

    expect(slice).toBeNull();
  });
});
