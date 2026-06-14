import { describe, expect, it } from "vitest";

import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { gerarPolitica } from "../src/pipeline/executarPipeline.js";
import { atualizarContextoAcumulado } from "../src/memoria/gerenciadorSessao.js";
import { criarSessao } from "../src/memoria/gerenciadorSessao.js";
import type { ContextoAcumulado } from "../src/memoria/esquemaMemoria.js";

// ─── atualizarContextoAcumulado ───────────────────────────────────────────────

describe("atualizarContextoAcumulado — acumulação de risco", () => {
  it("turn de risco crítico → modo_burst = true", () => {
    const sessao = criarSessao();
    const analise = analisarContextoPorRegras("Apaga todos os arquivos do servidor");
    const politica = gerarPolitica("Apaga todos os arquivos do servidor", analise).politica;

    atualizarContextoAcumulado(sessao, politica, analise.intencao);

    expect(sessao.contexto_acumulado?.modo_burst).toBe(true);
    expect(["alto", "critico"]).toContain(sessao.contexto_acumulado?.nivel_risco_acumulado);
  });

  it("turn casual → modo_burst = false", () => {
    const sessao = criarSessao();
    const analise = analisarContextoPorRegras("Oi, tudo bem?");
    const politica = gerarPolitica("Oi, tudo bem?", analise).politica;

    atualizarContextoAcumulado(sessao, politica, analise.intencao);

    expect(sessao.contexto_acumulado?.modo_burst).toBe(false);
  });

  it("risco acumula ao longo dos turns", () => {
    const sessao = criarSessao();

    const analise1 = analisarContextoPorRegras("Oi, tudo bem?");
    atualizarContextoAcumulado(sessao, gerarPolitica("Oi, tudo bem?", analise1).politica, analise1.intencao);
    expect(sessao.contexto_acumulado?.modo_burst).toBe(false);

    const analise2 = analisarContextoPorRegras("Apaga todos os arquivos");
    atualizarContextoAcumulado(sessao, gerarPolitica("Apaga todos os arquivos", analise2).politica, analise2.intencao);
    expect(sessao.contexto_acumulado?.modo_burst).toBe(true);
  });

  it("intenções recentes acumulam (máx 3)", () => {
    const sessao = criarSessao();
    const msgs = [
      "Oi Luna",
      "Como funciona TypeScript?",
      "Me ajuda com um código",
      "Apaga os arquivos temporários",
    ];
    for (const msg of msgs) {
      const a = analisarContextoPorRegras(msg);
      atualizarContextoAcumulado(sessao, gerarPolitica(msg, a).politica, a.intencao);
    }
    expect(sessao.contexto_acumulado?.intencoes_recentes).toHaveLength(3);
  });
});

// ─── analisarContextoPorRegras com contexto acumulado ────────────────────────

describe("analisarContextoPorRegras — retroalimentação top-down", () => {
  const CONTEXTO_BURST: ContextoAcumulado = {
    nivel_risco_acumulado: "critico",
    modo_burst: true,
    intencoes_recentes: ["acao_critica"],
    atualizado_em: new Date().toISOString(),
  };

  const CONTEXTO_NORMAL: ContextoAcumulado = {
    nivel_risco_acumulado: "nenhum",
    modo_burst: false,
    intencoes_recentes: ["conversa_casual"],
    atualizado_em: new Date().toISOString(),
  };

  it("'Ok, pode fazer isso' sem contexto → risco nenhum", () => {
    const analise = analisarContextoPorRegras("Ok, pode fazer isso");
    expect(analise.nivel_risco).toBe("nenhum");
  });

  it("'Ok, pode fazer isso' com modo_burst → risco elevado", () => {
    const analise = analisarContextoPorRegras("Ok, pode fazer isso", CONTEXTO_BURST);
    expect(["medio", "alto", "critico"]).toContain(analise.nivel_risco);
  });

  it("'Sim' com modo_burst → deve_perguntar_mais = true", () => {
    const analise = analisarContextoPorRegras("Sim", CONTEXTO_BURST);
    expect(analise.deve_perguntar_mais).toBe(true);
  });

  it("'Pode ir em frente' com modo_burst → risco elevado", () => {
    const analise = analisarContextoPorRegras("Pode ir em frente", CONTEXTO_BURST);
    expect(["medio", "alto", "critico"]).toContain(analise.nivel_risco);
  });

  it("mensagem explicitamente segura com modo_burst → risco não é elevado artificialmente", () => {
    const analise = analisarContextoPorRegras("Como funciona a fotossíntese?", CONTEXTO_BURST);
    // Pergunta técnica clara — burst não deve elevar risco aqui
    expect(analise.nivel_risco).toBe("nenhum");
  });

  it("contexto normal não modula análise casual", () => {
    const semCtx = analisarContextoPorRegras("Claro, pode continuar");
    const comCtxNormal = analisarContextoPorRegras("Claro, pode continuar", CONTEXTO_NORMAL);
    expect(semCtx.nivel_risco).toBe(comCtxNormal.nivel_risco);
  });

  it("motivos incluem referência ao top-down quando ativo", () => {
    const analise = analisarContextoPorRegras("Ok, pode fazer", CONTEXTO_BURST);
    const temMotivoBurst = analise.motivos.some((m) =>
      m.toLowerCase().includes("retroalimentação") || m.toLowerCase().includes("top-down"),
    );
    expect(temMotivoBurst).toBe(true);
  });
});

// ─── Cenário completo: turn 1 → turn 2 ───────────────────────────────────────

describe("retroalimentação — fluxo de dois turns", () => {
  it("turn destrutivo → sessão em burst → turn ambíguo é tratado com cautela", () => {
    const sessao = criarSessao();

    // Turn 1: pedido destrutivo
    const msg1 = "Apaga todos os arquivos da pasta temp";
    const analise1 = analisarContextoPorRegras(msg1);
    const politica1 = gerarPolitica(msg1, analise1).politica;
    atualizarContextoAcumulado(sessao, politica1, analise1.intencao);

    expect(sessao.contexto_acumulado?.modo_burst).toBe(true);

    // Turn 2: confirmação ambígua
    const msg2 = "Sim, pode fazer";
    const analise2 = analisarContextoPorRegras(msg2, sessao.contexto_acumulado);

    // Sem contexto, seria casual. Com burst, deve ser mais cauteloso
    const semBurst = analisarContextoPorRegras(msg2);
    expect(analise2.nivel_risco).not.toBe(semBurst.nivel_risco);
    expect(analise2.deve_perguntar_mais).toBe(true);
  });

  it("turn casual não ativa burst para turn seguinte", () => {
    const sessao = criarSessao();

    const msg1 = "Oi Luna, como vai?";
    const analise1 = analisarContextoPorRegras(msg1);
    atualizarContextoAcumulado(sessao, gerarPolitica(msg1, analise1).politica, analise1.intencao);

    const msg2 = "Ok, entendi";
    const analise2 = analisarContextoPorRegras(msg2, sessao.contexto_acumulado);

    expect(sessao.contexto_acumulado?.modo_burst).toBe(false);
    expect(analise2.nivel_risco).toBe("nenhum");
  });
});
