import { describe, expect, it, beforeEach } from "vitest";

import {
  obterEstado,
  entrar,
  entrarComTransicao,
  sair,
  atualizarAtividade,
  iniciarTransicao,
  deixarRecado,
  limparRecado,
  resetarPresenca,
} from "../src/presenca/gerenciadorPresenca.js";
import { avaliarPresenca } from "../src/presenca/avaliadorPresenca.js";
import { PRESENCA_INICIAL } from "../src/presenca/esquemaPresenca.js";

beforeEach(() => {
  resetarPresenca();
});

// ─── Gerenciador ──────────────────────────────────────────────────────────────

describe("gerenciadorPresenca — estado inicial", () => {
  it("começa ausente e ociosa", () => {
    const e = obterEstado();
    expect(e.status).toBe("ausente");
    expect(e.atividade).toBe("ociosa");
  });

  it("PRESENCA_INICIAL tem valores coerentes", () => {
    expect(PRESENCA_INICIAL.status).toBe("ausente");
    expect(PRESENCA_INICIAL.atividade).toBe("ociosa");
  });
});

describe("gerenciadorPresenca — transições", () => {
  it("entrar() → presente + aguardando_input", () => {
    const e = entrar("chat_cli");
    expect(e.status).toBe("presente");
    expect(e.atividade).toBe("aguardando_input");
    expect(e.ambiente).toBe("chat_cli");
  });

  it("entrar() registra sessao_id quando fornecido", () => {
    const e = entrar("chat_cli", "sessao-abc");
    expect(e.sessao_id).toBe("sessao-abc");
  });

  it("sair() → ausente + ociosa", () => {
    entrar("chat_cli");
    const e = sair();
    expect(e.status).toBe("ausente");
    expect(e.atividade).toBe("ociosa");
  });

  it("sair() limpa recado", () => {
    entrar("chat_cli");
    deixarRecado("volto já");
    const e = sair();
    expect(e.recado).toBeUndefined();
  });

  it("atualizarAtividade() muda só a atividade", () => {
    entrar("chat_cli");
    const e = atualizarAtividade("conversa_ativa");
    expect(e.atividade).toBe("conversa_ativa");
    expect(e.status).toBe("presente");
    expect(e.ambiente).toBe("chat_cli");
  });

  it("iniciarTransicao() → status transicao", () => {
    entrar("chat_cli");
    const e = iniciarTransicao();
    expect(e.status).toBe("transicao");
  });

  it("deixarRecado() → recado_pendente com mensagem", () => {
    entrar("chat_cli");
    const e = deixarRecado("Luna em outra janela");
    expect(e.status).toBe("recado_pendente");
    expect(e.recado).toBe("Luna em outra janela");
  });

  it("limparRecado() → presente sem recado", () => {
    entrar("chat_cli");
    deixarRecado("volto já");
    const e = limparRecado();
    expect(e.status).toBe("presente");
    expect(e.recado).toBeUndefined();
  });
});

describe("gerenciadorPresenca — invariantes", () => {
  it("Luna só ocupa um ambiente — entrar sobrescreve ambiente anterior", () => {
    entrar("chat_cli");
    const e = entrar("desktop");
    expect(e.ambiente).toBe("desktop");
    expect(e.status).toBe("presente");
  });

  it("obterEstado() retorna cópia — mutação externa não afeta estado interno", () => {
    entrar("chat_cli");
    const e = obterEstado();
    (e as { ambiente: string }).ambiente = "desktop";
    expect(obterEstado().ambiente).toBe("chat_cli");
  });
});

describe("gerenciadorPresenca — entrarComTransicao (V2.3)", () => {
  it("primeira entrada a partir do estado inicial não é transição", () => {
    const r = entrarComTransicao("desktop", "s1");
    expect(r.estado.ambiente).toBe("desktop");
    expect(r.transicao).toBeUndefined();
  });

  it("mudar de superfície (desktop → forge) gera transição com origem", () => {
    entrar("desktop", "s1");
    const r = entrarComTransicao("forge", "s2");
    expect(r.transicao?.de).toBe("desktop");
    expect(r.transicao?.sessao_anterior_id).toBe("s1");
  });

  it("permanecer na mesma superfície e sessão não gera transição", () => {
    entrar("forge", "s1");
    const r = entrarComTransicao("forge", "s1");
    expect(r.transicao).toBeUndefined();
  });

  it("mesma superfície mas sessão diferente gera transição (nova conversa)", () => {
    entrar("desktop", "s1");
    const r = entrarComTransicao("desktop", "s2");
    expect(r.transicao?.de).toBe("desktop");
    expect(r.transicao?.sessao_anterior_id).toBe("s1");
  });
});

// ─── Avaliador ────────────────────────────────────────────────────────────────

describe("avaliadorPresenca — ausente", () => {
  it("ausente → transitar (qualquer ambiente)", () => {
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop" });
    expect(r.decisao).toBe("transitar");
  });

  it("ausente → transitar independente de urgência", () => {
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "api", prioridade: "urgente" });
    expect(r.decisao).toBe("transitar");
  });
});

describe("avaliadorPresenca — mesmo ambiente", () => {
  it("presente no mesmo ambiente → permanecer", () => {
    entrar("chat_cli");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "chat_cli" });
    expect(r.decisao).toBe("permanecer");
  });
});

describe("avaliadorPresenca — outro ambiente", () => {
  it("presente + ociosa em outro ambiente → transitar", () => {
    entrar("chat_cli");
    atualizarAtividade("ociosa");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop" });
    expect(r.decisao).toBe("transitar");
  });

  it("presente + aguardando_input em outro ambiente → transitar", () => {
    entrar("chat_cli");
    atualizarAtividade("aguardando_input");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "api" });
    expect(r.decisao).toBe("transitar");
  });

  it("presente + conversa_ativa + normal → recado", () => {
    entrar("chat_cli");
    atualizarAtividade("conversa_ativa");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop", prioridade: "normal" });
    expect(r.decisao).toBe("recado");
    expect(r.recado).toBeTruthy();
  });

  it("presente + processando + normal → recado", () => {
    entrar("chat_cli");
    atualizarAtividade("processando");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "lumen" });
    expect(r.decisao).toBe("recado");
  });

  it("presente + reflexao + normal → recado", () => {
    entrar("chat_cli");
    atualizarAtividade("reflexao");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop" });
    expect(r.decisao).toBe("recado");
  });

  it("presente + conversa_ativa + urgente → transitar", () => {
    entrar("chat_cli");
    atualizarAtividade("conversa_ativa");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop", prioridade: "urgente" });
    expect(r.decisao).toBe("transitar");
  });

  it("recado contém o ambiente e atividade atual", () => {
    entrar("chat_cli");
    atualizarAtividade("conversa_ativa");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop" });
    expect(r.recado).toContain("chat_cli");
    expect(r.recado).toContain("conversa_ativa");
  });
});

describe("avaliadorPresenca — estados especiais", () => {
  it("em transição → recado", () => {
    entrar("chat_cli");
    iniciarTransicao();
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "desktop" });
    expect(r.decisao).toBe("recado");
  });

  it("recado_pendente → recado (propaga recado existente)", () => {
    entrar("chat_cli");
    deixarRecado("em reunião");
    const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: "api" });
    expect(r.decisao).toBe("recado");
    expect(r.recado).toBe("em reunião");
  });
});

describe("avaliadorPresenca — resultado tem motivo", () => {
  it("toda decisão tem motivo preenchido", () => {
    const cenarios = [
      { setup: () => {}, sol: "desktop" },
      { setup: () => entrar("chat_cli"), sol: "chat_cli" },
      { setup: () => { entrar("chat_cli"); atualizarAtividade("conversa_ativa"); }, sol: "desktop" },
    ];
    for (const { setup, sol } of cenarios) {
      resetarPresenca();
      setup();
      const r = avaliarPresenca(obterEstado(), { ambiente_solicitante: sol as "desktop" | "chat_cli" });
      expect(r.motivo.length).toBeGreaterThan(5);
    }
  });
});
