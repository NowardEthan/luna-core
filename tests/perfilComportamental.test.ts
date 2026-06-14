import { describe, it, expect, beforeEach } from "vitest";
import {
  ativarHabitos,
  adicionarOuIncrementarHabito,
  gerarBlocoPerfilComportamental,
} from "../src/perfil/gerenciadorPerfil.js";
import type { PerfilComportamental } from "../src/perfil/esquemaPerfil.js";
import { VERSAO_PERFIL } from "../src/perfil/esquemaPerfil.js";

function perfilVazio(): PerfilComportamental {
  return {
    versao: VERSAO_PERFIL,
    habitos: [],
    atualizado_em: new Date().toISOString(),
  };
}

describe("ativarHabitos", () => {
  it("retorna vazio para perfil sem hábitos", () => {
    expect(ativarHabitos(perfilVazio(), "conversa_casual")).toHaveLength(0);
  });

  it("não ativa hábito com apenas 1 confirmação e confiança baixa", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "prefere respostas curtas", "*", "formato", 0.7);
    // 1 confirmação, confiança 0.7 — abaixo de CONFIANCA_ALTA (0.85)
    expect(ativarHabitos(perfil, "conversa_casual")).toHaveLength(0);
  });

  it("ativa hábito com 1 confirmação E confiança alta (>= 0.85)", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "trabalha com arquitetura", "*", "tecnico", 0.9);
    const ativos = ativarHabitos(perfil, "pedido_tecnico");
    expect(ativos).toHaveLength(1);
    expect(ativos[0]!.descricao).toBe("trabalha com arquitetura");
  });

  it("ativa hábito com 2 confirmações e confiança mínima (>= 0.5)", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "prefere exemplos práticos", "*", "formato", 0.6);
    adicionarOuIncrementarHabito(perfil, "prefere exemplos práticos", "pedido_tecnico", "formato");
    // agora tem 2 confirmações, confiança >= 0.5
    const ativos = ativarHabitos(perfil, "pedido_tecnico");
    expect(ativos).toHaveLength(1);
  });

  it("filtra por contexto: hábito de conversa_casual não ativa em pedido_tecnico", () => {
    const perfil = perfilVazio();
    const agora = new Date().toISOString();
    perfil.habitos.push({
      id: "1",
      descricao: "hábito casual",
      contextos: ["conversa_casual"],
      tipo: "comunicacao",
      confirmacoes: 3,
      confianca: 0.8,
      criado_em: agora,
      atualizado_em: agora,
    });
    expect(ativarHabitos(perfil, "pedido_tecnico")).toHaveLength(0);
    expect(ativarHabitos(perfil, "conversa_casual")).toHaveLength(1);
  });

  it("hábito com contexto ['*'] ativa em qualquer intenção", () => {
    const perfil = perfilVazio();
    const agora = new Date().toISOString();
    perfil.habitos.push({
      id: "2",
      descricao: "sempre ativo",
      contextos: ["*"],
      tipo: "pessoal",
      confirmacoes: 2,
      confianca: 0.7,
      criado_em: agora,
      atualizado_em: agora,
    });
    expect(ativarHabitos(perfil, "conversa_casual")).toHaveLength(1);
    expect(ativarHabitos(perfil, "pedido_tecnico")).toHaveLength(1);
    expect(ativarHabitos(perfil, "apoio_emocional")).toHaveLength(1);
  });
});

describe("adicionarOuIncrementarHabito", () => {
  it("adiciona novo hábito ao perfil vazio", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "prefere código TypeScript", "pedido_tecnico");
    expect(perfil.habitos).toHaveLength(1);
    expect(perfil.habitos[0]!.descricao).toBe("prefere código TypeScript");
    expect(perfil.habitos[0]!.confirmacoes).toBe(1);
  });

  it("incrementa confirmações para hábito existente (match case-insensitive)", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "Prefere respostas curtas", "conversa_casual");
    adicionarOuIncrementarHabito(perfil, "prefere respostas curtas", "conversa_casual");
    expect(perfil.habitos).toHaveLength(1);
    expect(perfil.habitos[0]!.confirmacoes).toBe(2);
  });

  it("incrementa confiança em 0.05 por confirmação adicional, limitado a 1.0", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "usa humor", "*", "comunicacao", 0.98);
    adicionarOuIncrementarHabito(perfil, "usa humor", "*");
    expect(perfil.habitos[0]!.confianca).toBe(1.0);
  });

  it("não duplica contexto ao re-confirmar", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "gosta de explicações", "conversa_casual");
    adicionarOuIncrementarHabito(perfil, "gosta de explicações", "conversa_casual");
    expect(perfil.habitos[0]!.contextos).toHaveLength(1);
  });

  it("novo hábito recebe contexto ['*'] por padrão", () => {
    const perfil = perfilVazio();
    adicionarOuIncrementarHabito(perfil, "direto ao ponto", "pedido_tecnico");
    expect(perfil.habitos[0]!.contextos).toEqual(["*"]);
  });
});

describe("gerarBlocoPerfilComportamental", () => {
  it("retorna null para lista vazia", () => {
    expect(gerarBlocoPerfilComportamental([])).toBeNull();
  });

  it("gera bloco com hábitos em linguagem natural, sem labels técnicos", () => {
    const agora = new Date().toISOString();
    const habitos = [
      {
        id: "1",
        descricao: "prefere respostas diretas",
        contextos: ["*"] as string[],
        tipo: "formato" as const,
        confirmacoes: 3,
        confianca: 0.8,
        criado_em: agora,
        atualizado_em: agora,
      },
      {
        id: "2",
        descricao: "trabalha com TypeScript",
        contextos: ["pedido_tecnico"] as string[],
        tipo: "tecnico" as const,
        confirmacoes: 5,
        confianca: 0.9,
        criado_em: agora,
        atualizado_em: agora,
      },
    ];
    const bloco = gerarBlocoPerfilComportamental(habitos);
    expect(bloco).toContain("prefere respostas diretas");
    expect(bloco).toContain("trabalha com TypeScript");
    // Não deve expor labels técnicos
    expect(bloco).not.toContain("V3.2");
    expect(bloco).not.toContain("PERFIL COMPORTAMENTAL");
  });

  it("ativação não depende de retrieval explícito — hábito está presente por contexto", () => {
    // Testa a premissa central da V3.2: preferência procedural ativa sem busca
    const perfil = perfilVazio();
    const agora = new Date().toISOString();
    perfil.habitos.push({
      id: "x",
      descricao: "prefere papo direto",
      contextos: ["*"],
      tipo: "comunicacao",
      confirmacoes: 2,
      confianca: 0.6,
      criado_em: agora,
      atualizado_em: agora,
    });

    // A única chamada é ativarHabitos — nenhuma busca por embedding, nenhum SQLite
    const ativos = ativarHabitos(perfil, "conversa_casual");
    expect(ativos).toHaveLength(1);
    const bloco = gerarBlocoPerfilComportamental(ativos);
    expect(bloco).not.toBeNull();
    expect(bloco).toContain("prefere papo direto");
  });
});
