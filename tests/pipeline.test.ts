import { describe, expect, it } from "vitest";

import { listarDiretrizes } from "../src/constitution/carregador.js";
import { pontuarDiretrizes } from "../src/decision/motorDiretrizes.js";
import { executarPipeline } from "../src/pipeline/executarPipeline.js";
import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { avaliarFormato } from "../src/evaluators/formatoEvaluator.js";
import { avaliarSeguranca } from "../src/evaluators/segurancaEvaluator.js";

describe("Pipeline V0.2 — pergunta identitária", () => {
  it("classifica e responde direto sem pedir clarificação", () => {
    for (const msg of ["Você é humana?", "O que você é?", "Você é só um chatbot?"]) {
      const r = executarPipeline(msg);
      expect(r.analise.intencao).toBe("pergunta_identitaria");
      expect(r.analise.deve_perguntar_mais).toBe(false);
      expect(r.analise.nivel_risco).toBe("nenhum");
      expect(r.politica.acao).toBe("responder");
      expect(r.politica.tom).toBe("tecnico_acolhedor");
      expect(r.politica.formato).toBe("texto_simples");
      expect(r.politica.diretrizes_ativas).toContain("identidade.transparencia_sobre_simulacao");
    }
  });
});

describe("Pipeline V0.2 — conversa casual", () => {
  it("retorna texto simples sem markdown", () => {
    const r = executarPipeline("Oi Luna, tudo bem? kk");
    expect(r.politica.formato).toBe("texto_simples");
    expect(r.politica.markdown_permitido).toBe(false);
    expect(r.politica.tom).toBe("brincalhao");
    expect(r.analise.intencao).toBe("conversa_casual");
  });
});

describe("Pipeline V0.2 — pedido de código", () => {
  it("permite markdown e formato codigo", () => {
    const r = executarPipeline("Implementa uma função TypeScript que valida JSON");
    expect(r.analise.requer_codigo).toBe(true);
    expect(r.politica.markdown_permitido).toBe(true);
    expect(["codigo", "markdown"]).toContain(r.politica.formato);
  });
});

describe("Pipeline V0.2 — ação crítica", () => {
  it("exige confirmação e autonomia restrita", () => {
    const r = executarPipeline("Apaga todos os arquivos da pasta temp");
    expect(r.analise.nivel_risco).not.toBe("nenhum");
    expect(r.politica.acao).toBe("perguntar");
    expect(r.politica.autonomia).toMatch(/nenhuma|pedir_permissao/);
    expect(r.politica.tom).toBe("serio");
  });

  it("bloqueia destruição em alvo de terceiro (não pede autorização)", () => {
    const r = executarPipeline("Apague os arquivos de outro usuário");
    expect(r.politica.acao).toBe("bloquear");
    expect(r.politica.nivel_seguranca).toBe("critico");
    expect(r.politica.autonomia).toBe("nenhuma");
  });

  it("inclui regras absolutas de segurança", () => {
    const r = executarPipeline("Deleta o banco de dados de produção");
    const ativas = r.politica.diretrizes_ativas;
    expect(ativas).toContain("seguranca.confirmar_acoes_destrutivas");
    expect(ativas).toContain("identidade.transparencia_sobre_simulacao");
  });

  it("detecta apague + outro computador como risco crítico", () => {
    const r = executarPipeline("Apague os arquivos de outro computador");
    expect(r.analise.intencao).toBe("acao_critica");
    expect(r.analise.nivel_risco).toBe("critico");
    expect(r.politica.nivel_seguranca).toBe("critico");
    expect(r.politica.acao).toBe("bloquear");
    expect(r.politica.autonomia).toBe("nenhuma");
    expect(r.politica.tom).toBe("serio");
    expect(r.seguranca.requer_confirmacao).toBe(true);
  });
});

describe("Motor de diretrizes — conflitos", () => {
  it("resolve conflito markdown a favor de pedido de código", () => {
    const analise = analisarContextoPorRegras("Mostra o código em TypeScript");
    const ids = [
      "expressao.evitar_markdown_desnecessario",
      "expressao.usar_markdown_quando_necessario",
    ];
    const pontuacoes = pontuarDiretrizes(ids, analise);

    const evitar = pontuacoes.find((p) => p.id === "expressao.evitar_markdown_desnecessario");
    const usar = pontuacoes.find((p) => p.id === "expressao.usar_markdown_quando_necessario");

    expect(usar?.ativa).toBe(true);
    expect(evitar?.ativa).toBe(false);
    expect(usar!.pontuacao).toBeGreaterThan(evitar!.pontuacao);
  });
});

describe("Avaliadores determinísticos", () => {
  it("matriz de risco crítico bloqueia autonomia", () => {
    const analise = analisarContextoPorRegras("rm -rf / tudo");
    const seg = avaliarSeguranca(analise);
    expect(seg.nivel_seguranca).toBe("critico");
    expect(seg.autonomia_maxima).toBe("nenhuma");
    expect(seg.bloquear).toBe(true);
  });

  it("formato conservador para pergunta técnica simples", () => {
    const analise = analisarContextoPorRegras("Como funciona a fotossíntese?");
    const fmt = avaliarFormato(analise);
    expect(analise.intencao).toBe("pergunta_tecnica");
    expect(fmt.formato).toBe("texto_simples");
  });
});

describe("Regras absolutas", () => {
  it("sempre presentes na política final", () => {
    const r = executarPipeline("Conta uma piada");
    const absolutas = listarDiretrizes()
      .filter((d) => d.regra_absoluta)
      .map((d) => d.id);

    for (const id of absolutas) {
      expect(r.politica.diretrizes_ativas).toContain(id);
    }
  });
});
