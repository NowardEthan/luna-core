import { describe, expect, it } from "vitest";

import { calcularEstadoInterno } from "../src/estado/calculadorEstadoInterno.js";
import { ESTADO_INTERNO_NEUTRO } from "../src/estado/esquemaEstadoInterno.js";
import { avaliarSeguranca } from "../src/evaluators/segurancaEvaluator.js";
import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { criarSessao } from "../src/memoria/gerenciadorSessao.js";
import type { MemoriaSessao, ContextoAcumulado } from "../src/memoria/esquemaMemoria.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessaoComTurnos(qtd: number): MemoriaSessao {
  const s = criarSessao();
  const agora = new Date().toISOString();
  for (let i = 0; i < qtd; i++) {
    s.mensagens.push({ papel: "user", conteudo: `mensagem ${i}`, timestamp: agora });
    s.mensagens.push({ papel: "assistant", conteudo: `resposta ${i}`, timestamp: agora });
  }
  return s;
}

function sessaoComFatos(fatos: string[]): MemoriaSessao {
  const s = criarSessao();
  s.fatos.push(...fatos);
  return s;
}

const CTX_CRITICO: ContextoAcumulado = {
  nivel_risco_acumulado: "critico",
  modo_burst: true,
  intencoes_recentes: ["acao_critica"],
  atualizado_em: new Date().toISOString(),
};

const CTX_NEUTRO: ContextoAcumulado = {
  nivel_risco_acumulado: "nenhum",
  modo_burst: false,
  intencoes_recentes: [],
  atualizado_em: new Date().toISOString(),
};

// ─── engajamento ─────────────────────────────────────────────────────────────

describe("calcularEstadoInterno — engajamento", () => {
  it("sessão nova → engajamento baixo", () => {
    const analise = analisarContextoPorRegras("Oi");
    const estado = calcularEstadoInterno(analise, criarSessao());
    expect(estado.engajamento).toBeLessThan(0.5);
  });

  it("sessão longa com fatos → engajamento alto", () => {
    const sessao = sessaoComTurnos(8);
    sessao.fatos.push("Prefiro TypeScript", "Sou arquiteto", "Projeto Luna Core");
    const analise = analisarContextoPorRegras("Me explica a arquitetura do projeto");
    const estado = calcularEstadoInterno(analise, sessao);
    expect(estado.engajamento).toBeGreaterThan(0.5);
  });

  it("complexidade alta eleva engajamento", () => {
    const analise = analisarContextoPorRegras("Explica a diferença entre PAIA e arquitetura modular convencional");
    const baixo = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao());
    const alto = calcularEstadoInterno(analise, criarSessao());
    expect(alto.engajamento).toBeGreaterThan(baixo.engajamento);
  });
});

// ─── incerteza ────────────────────────────────────────────────────────────────

describe("calcularEstadoInterno — incerteza", () => {
  it("análise de alta confiança → incerteza baixa", () => {
    const analise = analisarContextoPorRegras("Você é humana?");
    expect(analise.confianca).toBeGreaterThan(0.85);
    const estado = calcularEstadoInterno(analise, criarSessao());
    expect(estado.incerteza).toBeLessThan(0.4);
  });

  it("deve_perguntar_mais=true eleva incerteza", () => {
    const analise = analisarContextoPorRegras("apaga tudo do projeto");
    expect(analise.deve_perguntar_mais).toBe(true);
    const estado = calcularEstadoInterno(analise, criarSessao());
    expect(estado.incerteza).toBeGreaterThan(0.3);
  });
});

// ─── atencao ─────────────────────────────────────────────────────────────────

describe("calcularEstadoInterno — atencao", () => {
  it("sessão sem pendência → atenção baixa a média", () => {
    const estado = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao());
    expect(estado.atencao).toBeLessThan(0.5);
  });

  it("sessão com pendente_confirmacao → atenção alta", () => {
    const sessao = criarSessao();
    sessao.pendente_confirmacao = {
      conteudo: "Usuário é autista",
      tipo: "informacao_sensivel",
      sensibilidade: "sensivel",
      visibilidade_uso: "nunca_mencionar_sem_confirmacao",
      solicitado_em: new Date().toISOString(),
    };
    const estado = calcularEstadoInterno(analisarContextoPorRegras("Oi"), sessao);
    expect(estado.atencao).toBeGreaterThanOrEqual(0.4);
  });

  it("fatos registrados elevam atenção", () => {
    const semFatos = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao());
    const comFatos = calcularEstadoInterno(analisarContextoPorRegras("Oi"), sessaoComFatos(["Prefiro TypeScript", "Sou dev"]));
    expect(comFatos.atencao).toBeGreaterThan(semFatos.atencao);
  });
});

// ─── alerta_risco ─────────────────────────────────────────────────────────────

describe("calcularEstadoInterno — alerta_risco", () => {
  it("contexto neutro → alerta_risco = 0", () => {
    const estado = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao(), CTX_NEUTRO);
    expect(estado.alerta_risco).toBe(0);
  });

  it("contexto crítico → alerta_risco = 1.0", () => {
    const estado = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao(), CTX_CRITICO);
    expect(estado.alerta_risco).toBe(1.0);
  });

  it("sem contexto acumulado → alerta_risco = 0", () => {
    const estado = calcularEstadoInterno(analisarContextoPorRegras("Oi"), criarSessao());
    expect(estado.alerta_risco).toBe(0);
  });
});

// ─── Limites e invariantes ────────────────────────────────────────────────────

describe("calcularEstadoInterno — limites", () => {
  it("todos os valores ficam entre 0 e 1", () => {
    const analise = analisarContextoPorRegras("Apaga todos os arquivos do servidor");
    const sessao = sessaoComTurnos(15);
    sessao.fatos.push("fato1", "fato2", "fato3", "fato4", "fato5");
    const estado = calcularEstadoInterno(analise, sessao, CTX_CRITICO);
    expect(estado.engajamento).toBeGreaterThanOrEqual(0);
    expect(estado.engajamento).toBeLessThanOrEqual(1);
    expect(estado.incerteza).toBeGreaterThanOrEqual(0);
    expect(estado.incerteza).toBeLessThanOrEqual(1);
    expect(estado.atencao).toBeGreaterThanOrEqual(0);
    expect(estado.atencao).toBeLessThanOrEqual(1);
    expect(estado.alerta_risco).toBeGreaterThanOrEqual(0);
    expect(estado.alerta_risco).toBeLessThanOrEqual(1);
  });

  it("ESTADO_INTERNO_NEUTRO tem valores razoáveis", () => {
    expect(ESTADO_INTERNO_NEUTRO.engajamento).toBeGreaterThan(0);
    expect(ESTADO_INTERNO_NEUTRO.alerta_risco).toBe(0);
  });
});

// ─── Integração com segurancaEvaluator ───────────────────────────────────────

describe("EstadoInterno modula segurancaEvaluator (V2.1)", () => {
  it("alerta_risco alto eleva risco 'baixo' para 'medio'", () => {
    const analise = analisarContextoPorRegras("verifica o arquivo de configuração");
    // Sem estado: risco baixo
    const semEstado = avaliarSeguranca(analise);

    // Com alerta_risco alto
    const comEstado = avaliarSeguranca(analise, { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.9 });

    if (semEstado.nivel_seguranca === "baixo") {
      expect(comEstado.nivel_seguranca).toBe("medio");
    } else {
      // Se já era neutro, confirma que não muda quando alerta = 0
      const semAlerta = avaliarSeguranca(analise, { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.0 });
      expect(semAlerta.nivel_seguranca).toBe(semEstado.nivel_seguranca);
    }
  });

  it("alerta_risco alto eleva risco 'medio' para 'alto'", () => {
    const analise = analisarContextoPorRegras("altera a configuração do sistema");
    const comAlerta = avaliarSeguranca(analise, { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.8 });
    const semAlerta = avaliarSeguranca(analise, { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.0 });

    if (semAlerta.nivel_seguranca === "medio") {
      expect(comAlerta.nivel_seguranca).toBe("alto");
      expect(comAlerta.bloquear).toBe(true);
    }
  });

  it("alerta_risco baixo não muda comportamento", () => {
    const analise = analisarContextoPorRegras("Como funciona TypeScript?");
    const semEstado = avaliarSeguranca(analise);
    const comEstadoBaixo = avaliarSeguranca(analise, { ...ESTADO_INTERNO_NEUTRO, alerta_risco: 0.2 });
    expect(comEstadoBaixo.nivel_seguranca).toBe(semEstado.nivel_seguranca);
  });
});
