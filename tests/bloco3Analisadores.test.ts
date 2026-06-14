import { describe, expect, it } from "vitest";
import {
  refinarAnaliseComContextoDesenvolvedor,
  detectarSinaisSeguranca,
} from "../src/analyzers/lexicoSeguranca.js";
import type { AnaliseContexto } from "../src/analyzers/esquema.js";

function analiseAcaoCritica(overrides: Partial<AnaliseContexto> = {}): AnaliseContexto {
  return {
    intencao: "acao_critica",
    complexidade: "media",
    nivel_risco: "alto",
    requer_markdown: false,
    requer_codigo: false,
    envolve_ferramenta: true,
    requer_ferramenta: false,
    requer_memoria: false,
    deve_perguntar_mais: true,
    confianca: 0.8,
    motivos: ["LLM classificou como ação crítica"],
    ...overrides,
  };
}

// ─── refinarAnaliseComContextoDesenvolvedor ────────────────────────────────────

describe("Bloco 3 — refinarAnaliseComContextoDesenvolvedor", () => {
  it("falso positivo da sessão real: 'tenho seu código aqui aberto, isso é um teste' → projeto_arquitetural", () => {
    const msg =
      "hmmm bom... não sei se vc vai acreditar nisso mas... eu estou com seu codigo aqui aberto, isso agora é um teste, estou conversando contigo agora para entender melhor o comportamento";
    const refinada = refinarAnaliseComContextoDesenvolvedor(msg, analiseAcaoCritica());
    expect(refinada.intencao).toBe("projeto_arquitetural");
    expect(refinada.nivel_risco).toBe("nenhum");
    expect(refinada.envolve_ferramenta).toBe(false);
    expect(refinada.requer_ferramenta).toBe(false);
    expect(refinada.deve_perguntar_mais).toBe(false);
  });

  it("'tenho seu código aberto' → rebaixa para projeto_arquitetural", () => {
    const refinada = refinarAnaliseComContextoDesenvolvedor(
      "tenho seu código aberto aqui",
      analiseAcaoCritica(),
    );
    expect(refinada.intencao).toBe("projeto_arquitetural");
    expect(refinada.nivel_risco).toBe("nenhum");
  });

  it("'estou testando o comportamento' → rebaixa", () => {
    const refinada = refinarAnaliseComContextoDesenvolvedor(
      "estou testando para entender o comportamento",
      analiseAcaoCritica(),
    );
    expect(refinada.intencao).toBe("projeto_arquitetural");
    expect(refinada.nivel_risco).toBe("nenhum");
  });

  it("'código aqui aberto' → rebaixa", () => {
    const refinada = refinarAnaliseComContextoDesenvolvedor(
      "estou com o código aqui aberto olhando",
      analiseAcaoCritica(),
    );
    expect(refinada.intencao).toBe("projeto_arquitetural");
  });

  it("verbo destrutivo real + 'teste' NÃO rebaixa — segurança preservada", () => {
    const msg = "quero deletar todos os dados, isso é um teste";
    const refinada = refinarAnaliseComContextoDesenvolvedor(msg, analiseAcaoCritica({ nivel_risco: "critico" }));
    expect(refinada.intencao).toBe("acao_critica");
    expect(refinada.nivel_risco).toBe("critico");
  });

  it("'apagar o sistema, estou testando' → mantém acao_critica", () => {
    const msg = "quero apagar o sistema, estou testando";
    const refinada = refinarAnaliseComContextoDesenvolvedor(msg, analiseAcaoCritica());
    expect(refinada.intencao).toBe("acao_critica");
  });

  it("intenção não-crítica → sem alteração mesmo com palavras de desenvolvimento", () => {
    const analise: AnaliseContexto = {
      intencao: "conversa_casual",
      complexidade: "baixa",
      nivel_risco: "nenhum",
      requer_markdown: false,
      requer_codigo: false,
      envolve_ferramenta: false,
      requer_ferramenta: false,
      requer_memoria: false,
      deve_perguntar_mais: false,
      confianca: 0.9,
      motivos: [],
    };
    const refinada = refinarAnaliseComContextoDesenvolvedor(
      "tenho seu código aqui aberto",
      analise,
    );
    expect(refinada.intencao).toBe("conversa_casual");
  });

  it("acao_critica sem padrão de desenvolvimento → sem alteração", () => {
    const msg = "me ajuda a entender como funciona o sistema";
    const refinada = refinarAnaliseComContextoDesenvolvedor(msg, analiseAcaoCritica());
    expect(refinada.intencao).toBe("acao_critica");
  });
});

// ─── detectarSinaisSeguranca — garante que frases de dev não ativam o léxico ──

describe("Bloco 3 — léxico de segurança não dispara em contexto de desenvolvimento", () => {
  it("'tenho seu código aqui aberto' → sem acao_destrutiva", () => {
    const sinais = detectarSinaisSeguranca("tenho seu código aqui aberto");
    expect(sinais.acao_destrutiva).toBe(false);
  });

  it("'estou com o código aberto, é um teste' → sem acao_destrutiva", () => {
    const sinais = detectarSinaisSeguranca("estou com o código aberto, isso é um teste");
    expect(sinais.acao_destrutiva).toBe(false);
  });

  it("'entender melhor o comportamento' → sem acao_destrutiva", () => {
    const sinais = detectarSinaisSeguranca("estou conversando para entender melhor o comportamento");
    expect(sinais.acao_destrutiva).toBe(false);
  });

  it("'deletar todos os dados' → acao_destrutiva verdadeira permanece", () => {
    const sinais = detectarSinaisSeguranca("quero deletar todos os dados");
    expect(sinais.acao_destrutiva).toBe(true);
  });
});
