import { describe, it, expect } from "vitest";
import { gerarPriorIntencao, gerarBlocoContextoPreditivo } from "../src/preditivo/analisadorPreditivo.js";
import type { MemoriaSessao } from "../src/memoria/esquemaMemoria.js";
import type { AnaliseContexto } from "../src/analyzers/esquema.js";

function sessaoBase(overrides: Partial<MemoriaSessao> = {}): MemoriaSessao {
  const agora = new Date().toISOString();
  return {
    id: "test-sessao",
    criada_em: agora,
    atualizada_em: agora,
    mensagens: [],
    fatos: [],
    preferencias: {},
    ...overrides,
  };
}

function analise(intencao: string): AnaliseContexto {
  return {
    intencao,
    complexidade: "baixa",
    nivel_risco: "nenhum",
    requer_codigo: false,
    requer_markdown: false,
    requer_ferramenta: false,
    requer_memoria: false,
    confianca: 0.9,
  };
}

describe("gerarPriorIntencao", () => {
  it("retorna null sem sessão", () => {
    expect(gerarPriorIntencao(undefined, analise("conversa_casual"))).toBeNull();
  });

  it("retorna null em sessão vazia sem histórico", () => {
    expect(gerarPriorIntencao(sessaoBase(), analise("conversa_casual"))).toBeNull();
  });

  it("padrão consistente: 3 turnos casuais → casual + consistente", () => {
    const sessao = sessaoBase({
      contexto_acumulado: {
        intencoes_recentes: ["conversa_casual", "conversa_casual", "conversa_casual"],
        nivel_risco_acumulado: "nenhum",
        modo_burst: false,
        atualizado_em: new Date().toISOString(),
      },
      mensagens: [
        { papel: "user", conteudo: "oi, tudo bem?", timestamp: "" },
        { papel: "assistant", conteudo: "sim!", timestamp: "" },
      ],
    });
    const prior = gerarPriorIntencao(sessao, analise("conversa_casual"));
    expect(prior).not.toBeNull();
    expect(prior!.padrao).toBe("consistente");
    expect(prior!.tom_esperado).toBe("casual");
    expect(prior!.dica_respondedor).toContain("leve");
  });

  it("padrão consistente: 3 turnos técnicos → tecnico + consistente", () => {
    const sessao = sessaoBase({
      contexto_acumulado: {
        intencoes_recentes: ["pedido_tecnico", "pedido_tecnico", "pedido_tecnico"],
        nivel_risco_acumulado: "nenhum",
        modo_burst: false,
        atualizado_em: new Date().toISOString(),
      },
      mensagens: [{ papel: "user", conteudo: "como resolver o bug?", timestamp: "" }],
    });
    const prior = gerarPriorIntencao(sessao, analise("pedido_tecnico"));
    expect(prior!.padrao).toBe("consistente");
    expect(prior!.tom_esperado).toBe("tecnico");
    expect(prior!.dica_respondedor).toContain("técnico");
  });

  it("padrão transição: casual → casual → tecnico", () => {
    const sessao = sessaoBase({
      contexto_acumulado: {
        intencoes_recentes: ["conversa_casual", "conversa_casual"],
        nivel_risco_acumulado: "nenhum",
        modo_burst: false,
        atualizado_em: new Date().toISOString(),
      },
      mensagens: [{ papel: "user", conteudo: "preciso debugar isso", timestamp: "" }],
    });
    const prior = gerarPriorIntencao(sessao, analise("pedido_tecnico"));
    expect(prior!.padrao).toBe("transicao");
    expect(prior!.dica_respondedor).toContain("Mudança");
  });

  it("padrão novo: sem histórico mas com mensagens", () => {
    const sessao = sessaoBase({
      mensagens: [{ papel: "user", conteudo: "olá!", timestamp: "" }],
    });
    const prior = gerarPriorIntencao(sessao, analise("conversa_casual"));
    expect(prior!.padrao).toBe("novo");
  });

  it("engajamento alto adiciona dica de engajamento", () => {
    const sessao = sessaoBase({
      contexto_acumulado: {
        intencoes_recentes: ["conversa_casual"],
        nivel_risco_acumulado: "nenhum",
        modo_burst: false,
        atualizado_em: new Date().toISOString(),
      },
      mensagens: [{ papel: "user", conteudo: "adorei!", timestamp: "" }],
      estado_interno: {
        engajamento: 0.9,
        incerteza: 0,
        atencao: 0.5,
        alerta_risco: 0,
        atualizado_em: new Date().toISOString(),
      },
    });
    const prior = gerarPriorIntencao(sessao, analise("conversa_casual"));
    expect(prior!.dica_respondedor).toContain("ngajamento");
  });

  it("modo burst adiciona dica de cautela", () => {
    const sessao = sessaoBase({
      contexto_acumulado: {
        intencoes_recentes: ["acao_critica"],
        nivel_risco_acumulado: "alto",
        modo_burst: true,
        atualizado_em: new Date().toISOString(),
      },
      mensagens: [{ papel: "user", conteudo: "quero deletar tudo", timestamp: "" }],
      estado_interno: {
        engajamento: 0.3,
        incerteza: 0.2,
        atencao: 0.8,
        alerta_risco: 0.8,
        atualizado_em: new Date().toISOString(),
      },
    });
    const prior = gerarPriorIntencao(sessao, analise("acao_critica"));
    expect(prior!.dica_respondedor).toContain("autela");
  });

  it("topico_recente extrai última mensagem do usuário", () => {
    const sessao = sessaoBase({
      mensagens: [
        { papel: "user", conteudo: "primeira mensagem", timestamp: "" },
        { papel: "assistant", conteudo: "resposta", timestamp: "" },
        { papel: "user", conteudo: "segunda mensagem do usuário", timestamp: "" },
      ],
    });
    const prior = gerarPriorIntencao(sessao, analise("conversa_casual"));
    expect(prior!.topico_recente).toBe("segunda mensagem do usuário");
  });
});

describe("gerarBlocoContextoPreditivo", () => {
  it("produz bloco não vazio com dica e tópico", () => {
    const bloco = gerarBlocoContextoPreditivo({
      topico_recente: "oi, tudo bem?",
      padrao: "consistente",
      tom_esperado: "casual",
      dica_respondedor: "Manter energia leve.",
    });
    expect(bloco).toBeTruthy();
    expect(bloco).toContain("Manter energia leve");
    expect(bloco).toContain("oi, tudo bem?");
    // Não deve expor campos machine-readable
    expect(bloco).not.toContain("V3.1");
    expect(bloco).not.toContain("padrao:");
    expect(bloco).not.toContain("tom_esperado:");
  });
});
