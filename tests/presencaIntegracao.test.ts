import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";

import { executarPipelineCompleto } from "../src/pipeline/executarPipelineCompleto.js";
import { resetarPresenca } from "../src/presenca/gerenciadorPresenca.js";
import { caminhoSessao } from "../src/memoria/storeSessao.js";
import type {
  ConfigLuna,
  ProvedorLlm,
  RequisicaoCompletacao,
  RespostaCompletacao,
} from "../src/providers/tipos.js";

// Estes testes inspecionam o prompt enviado ao MODELO GRANDE em turnos casuais.
// O gate de peso (P1 camada 1) os desviaria para o menor — ele tem testes próprios.
const gateAnterior = process.env.LUNA_GATE_PESO;
beforeAll(() => {
  process.env.LUNA_GATE_PESO = "0";
});
afterAll(() => {
  if (gateAnterior === undefined) delete process.env.LUNA_GATE_PESO;
  else process.env.LUNA_GATE_PESO = gateAnterior;
});

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost",
  modeloMenor: "menor",
  modeloMaior: "maior",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

const ANALISE = JSON.stringify({
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.85,
  motivos: ["mock"],
});

/** Provedor que captura o system prompt entregue ao respondedor (modelo maior). */
function criarProvedorCaptura() {
  const systemPrompts: string[] = [];
  const provedor: ProvedorLlm = {
    async completar(req: RequisicaoCompletacao): Promise<RespostaCompletacao> {
      if (req.modelo === "maior") {
        const sys = req.mensagens.find((m) => m.papel === "system");
        if (sys) systemPrompts.push(sys.conteudo);
        return { conteudo: "ok", modelo: req.modelo, latencia_ms: 1 };
      }
      return { conteudo: ANALISE, modelo: req.modelo, latencia_ms: 1 };
    },
  };
  return { provedor, systemPrompts };
}

const IDS = ["test-presenca-chat", "test-presenca-forge"];
const logs: string[] = [];

beforeEach(() => resetarPresenca());

afterEach(() => {
  resetarPresenca();
  for (const id of IDS) {
    const p = caminhoSessao(id);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  for (const l of logs.splice(0)) if (existsSync(l)) rmSync(l, { force: true });
});

describe("Presença ponta-a-ponta no pipeline (V2.3)", () => {
  it("injeta o bloco de presença com a superfície atual no prompt", async () => {
    const { provedor, systemPrompts } = criarProvedorCaptura();
    const r = await executarPipelineCompleto("oi", {
      provedor,
      config: CONFIG,
      ambiente: "desktop",
      sessaoId: "test-presenca-chat",
    });
    logs.push(r.log_path);

    expect(systemPrompts[0]).toContain("Luna Chat");
    expect(systemPrompts[0]).toMatch(/Presença|PRESENÇA/);
  });

  it("ao ir do chat para o Forge, reconhece a transição e traz o recap", async () => {
    const cap1 = criarProvedorCaptura();
    const r1 = await executarPipelineCompleto("vamos falar de deploy", {
      provedor: cap1.provedor,
      config: CONFIG,
      ambiente: "desktop",
      sessaoId: "test-presenca-chat",
    });
    logs.push(r1.log_path);

    const cap2 = criarProvedorCaptura();
    const r2 = await executarPipelineCompleto("agora no editor", {
      provedor: cap2.provedor,
      config: CONFIG,
      ambiente: "forge",
      sessaoId: "test-presenca-forge",
      detalhe_ambiente: "projeto «Orbit»",
    });
    logs.push(r2.log_path);

    const sys = cap2.systemPrompts[0] ?? "";
    expect(sys).toContain("Forge");
    expect(sys).toContain("projeto «Orbit»");
    expect(sys).toContain("transitar"); // reconhece a mudança de superfície
    expect(sys).toContain("deploy"); // recap do que foi conversado no chat
  });
});
