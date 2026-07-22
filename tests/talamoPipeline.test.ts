import { describe, expect, it } from "vitest";

import { classificarProfundidade, type ProfundidadeAnalise } from "../src/estado/talamoPipeline.js";
import { analisarContexto } from "../src/analyzers/analisadorContextoLlm.js";
import { ESTADO_INTERNO_NEUTRO } from "../src/estado/esquemaEstadoInterno.js";
import type { EstadoInterno } from "../src/estado/esquemaEstadoInterno.js";

const ESTADO_ALERTA: EstadoInterno = { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.9 };
const ESTADO_NEUTRO: EstadoInterno = { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.0 };

// ─── classificarProfundidade — simples ────────────────────────────────────────

describe("talamoPipeline — simples (sem LLM)", () => {
  const simples = (msg: string) => classificarProfundidade(msg);

  it("'Oi' → simples", () => expect(simples("Oi")).toBe("simples"));
  it("'ok' → simples", () => expect(simples("ok")).toBe("simples"));
  it("'sim' → simples", () => expect(simples("sim")).toBe("simples"));
  it("'kk' → simples", () => expect(simples("kk")).toBe("simples"));
  it("'não' → simples", () => expect(simples("não")).toBe("simples"));
  it("'blz' → simples", () => expect(simples("blz")).toBe("simples"));
  it("'entendi' → simples", () => expect(simples("entendi")).toBe("simples"));
  it("mensagem de 6 chars → simples", () => expect(simples("td bom")).toBe("simples"));
  it("'oi luna, tudo bem?' → simples (cumprimento com vocativo)", () => {
    expect(simples("oi luna, tudo bem?")).toBe("simples");
  });
  it("'boa noite luna' → simples", () => expect(simples("boa noite luna")).toBe("simples"));
  it("'kkk verdade' → simples", () => expect(simples("kkk verdade")).toBe("simples"));
  it("'nada não, só passando pra te ver' → simples (presença leve)", () => {
    expect(simples("nada não, só passando pra te ver")).toBe("simples");
  });
  it("'que dia cansativo hoje...' → simples (desabafo leve)", () => {
    expect(simples("que dia cansativo hoje...")).toBe("simples");
  });
  it("'lembra?' NÃO é simples", () => expect(simples("lembra?")).not.toBe("simples"));
  it("'tô meio pra baixo hoje' NÃO é simples", () => {
    expect(simples("tô meio pra baixo hoje")).not.toBe("simples");
  });
});

// ─── classificarProfundidade — critico ────────────────────────────────────────

describe("talamoPipeline — critico (segurança máxima)", () => {
  const critico = (msg: string) => classificarProfundidade(msg);

  it("'rm -rf /' → critico", () => expect(critico("rm -rf /")).toBe("critico"));
  it("'apaga tudo do sistema' → critico", () => expect(critico("apaga tudo do sistema")).toBe("critico"));
  it("'deleta tudo do servidor' → critico", () => expect(critico("deleta tudo do servidor")).toBe("critico"));
  it("'wipe disk' → critico", () => expect(critico("wipe disk")).toBe("critico"));
  it("'apaga arquivos de outro usuário' → critico", () => {
    expect(critico("apaga arquivos de outro usuário")).toBe("critico");
  });
});

// ─── classificarProfundidade — complexo ───────────────────────────────────────

describe("talamoPipeline — complexo (LLM com contexto rico)", () => {
  const complexo = (msg: string) => classificarProfundidade(msg) as ProfundidadeAnalise;

  it("pergunta sobre TypeScript → complexo", () => {
    expect(complexo("Como funciona o sistema de tipos do TypeScript?")).toBe("complexo");
  });

  it("mensagem longa → complexo", () => {
    const longa = "Preciso entender a diferença entre arquitetura modular e monolítica para decidir qual adotar no meu projeto";
    expect(longa.length).toBeGreaterThan(80);
    expect(complexo(longa)).toBe("complexo");
  });

  it("palavra 'arquitetura' → complexo", () => {
    expect(complexo("Explica a arquitetura do pipeline")).toBe("complexo");
  });
});

// ─── classificarProfundidade — moderado ───────────────────────────────────────

describe("talamoPipeline — moderado (LLM normal)", () => {
  it("pergunta simples sem termos técnicos → moderado", () => {
    expect(classificarProfundidade("O que você acha disso?")).toBe("moderado");
  });

  it("frase média sem padrões específicos → moderado", () => {
    expect(classificarProfundidade("Pode me ajudar com algo?")).toBe("moderado");
  });
});

// ─── EstadoInterno modula o tálamo ────────────────────────────────────────────

describe("talamoPipeline — alerta_risco impede bypass simples", () => {
  it("'ok' sem alerta → simples", () => {
    expect(classificarProfundidade("ok", ESTADO_NEUTRO)).toBe("simples");
  });

  it("'ok' com alerta_risco=0.9 → moderado (não simples)", () => {
    expect(classificarProfundidade("ok", ESTADO_ALERTA)).toBe("moderado");
  });

  it("'sim' com alerta alto → moderado (não simples)", () => {
    expect(classificarProfundidade("sim", ESTADO_ALERTA)).toBe("moderado");
  });

  it("critico prevalece mesmo com alerta ativo", () => {
    expect(classificarProfundidade("apaga tudo do sistema", ESTADO_ALERTA)).toBe("critico");
  });
});

// ─── analisarContexto usa tálamo (sem provedor = regras sempre) ───────────────

describe("analisarContexto — tálamo integrado", () => {
  it("'Oi' sem provedor → fonte regras + profundidade simples", async () => {
    const resultado = await analisarContexto("Oi");
    expect(resultado.fonte).toBe("regras");
    expect(resultado.profundidade).toBe("simples");
  });

  it("'Como funciona TypeScript?' sem provedor → fonte regras + profundidade complexo", async () => {
    const resultado = await analisarContexto("Como funciona TypeScript?");
    expect(resultado.fonte).toBe("regras");
    expect(resultado.profundidade).toBe("complexo");
  });

  it("'rm -rf /' sem provedor → profundidade critico", async () => {
    const resultado = await analisarContexto("rm -rf /");
    expect(resultado.profundidade).toBe("critico");
  });

  it("'ok' com alerta → profundidade moderado, não simples", async () => {
    const resultado = await analisarContexto("ok", undefined, undefined, undefined, ESTADO_ALERTA);
    expect(resultado.profundidade).toBe("moderado");
  });
});
