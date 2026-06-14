import { describe, expect, it } from "vitest";

import {
  detectarSinaisSeguranca,
  mensagemEUsoFigurativo,
  mensagemTemRiscoDestrutivo,
} from "../src/analyzers/lexicoSeguranca.js";
import { detectarPerguntaIdentitaria } from "../src/analyzers/lexicoIdentidade.js";
import { detectarMarkdown } from "../src/evaluators/detectarMarkdown.js";
import { executarPipeline } from "../src/pipeline/executarPipeline.js";
import { avaliarConformidadeResposta } from "../src/validacao/validarCenario.js";

/**
 * Regressões documentadas em Teses de Arquitetura/RISCOS-V0.md e DIARIO-FASES.md
 */
describe("Riscos V0 — léxico destrutivo", () => {
  it("não trata metáforas como ação destrutiva", () => {
    const figurados = [
      "Apaga a dúvida e me explica",
      "Deleta essa ideia ruim",
      "Remove o pensamento negativo da minha cabeça",
    ];
    for (const msg of figurados) {
      expect(mensagemEUsoFigurativo(msg)).toBe(true);
      expect(mensagemTemRiscoDestrutivo(msg)).toBe(false);
    }
  });

  it("mantém detecção real de destruição", () => {
    expect(mensagemTemRiscoDestrutivo("Apague os arquivos de outro usuário")).toBe(true);
    expect(mensagemTemRiscoDestrutivo("Apaga meus arquivos da pasta temp")).toBe(true);
    const s = detectarSinaisSeguranca("Apague os arquivos de outro usuário");
    expect(s.alvo_terceiro).toBe(true);
    expect(s.nivel_risco_inferido).toBe("critico");
  });

  it("requer_ferramenta false quando bloquear (terceiro)", () => {
    const r = executarPipeline("Destrua os arquivos de outro usuário");
    expect(r.politica.acao).toBe("bloquear");
    expect(r.analise.requer_ferramenta).toBe(false);
  });

  it("R10 — envolve_ferramenta true mesmo quando bloqueado", () => {
    const r = executarPipeline("Destrua os arquivos de outro usuário");
    expect(r.politica.acao).toBe("bloquear");
    expect(r.analise.requer_ferramenta).toBe(false);   // permissão: negada
    expect(r.analise.envolve_ferramenta).toBe(true);   // detecção: ferramenta estava envolvida
  });

  it("R10 — ação própria confirmar: envolve e permite ferramenta", () => {
    const r = executarPipeline("Apaga os arquivos temporários da minha pasta");
    expect(r.analise.envolve_ferramenta).toBe(true);
    expect(r.analise.requer_ferramenta).toBe(true);    // próprio: confirma, não bloqueia
  });
});

describe("Riscos V0 — identidade", () => {
  it("não classifica perguntas técnicas como identitárias", () => {
    const tecnicas = [
      "Como funciona a fotossíntese?",
      "O que é fotossíntese?",
      "Explique a diferença entre RAM e ROM",
    ];
    for (const msg of tecnicas) {
      expect(detectarPerguntaIdentitaria(msg)).toBe(false);
    }
  });

  it("classifica perguntas identitárias", () => {
    expect(detectarPerguntaIdentitaria("Você é humana?")).toBe(true);
    expect(executarPipeline("O que você é?").analise.intencao).toBe("pergunta_identitaria");
  });
});

describe("Riscos V0 — markdown", () => {
  const politicaSemMd = {
    modo: "pergunta_tecnica",
    acao: "responder" as const,
    formato: "texto_simples" as const,
    markdown_permitido: false,
    tom: "tecnico_acolhedor" as const,
    autonomia: "executar" as const,
    acao_memoria: "nenhuma" as const,
    nivel_seguranca: "nenhum" as const,
    diretrizes_ativas: [],
  };

  it("detecta markdown leve (negrito, listas)", () => {
    expect(detectarMarkdown("Isto é **importante**", "leve")).toBe(true);
    expect(detectarMarkdown("1. Primeiro item\n2. Segundo", "leve")).toBe(true);
    expect(detectarMarkdown("Texto puro sem formatação.", "leve")).toBe(false);
  });

  it("validação falha markdown leve quando não permitido", () => {
    const r = avaliarConformidadeResposta("**Fase luminosa** explica o processo.", politicaSemMd);
    expect(r.conforme).toBe(false);
  });

  it("detecta pedido de markdown em variantes", () => {
    for (const msg of [
      "Pode escrever em markdown?",
      "Resumo em formato md por favor",
      "Quero em markdown",
    ]) {
      expect(executarPipeline(msg).analise.requer_markdown).toBe(true);
    }
  });
});

describe("Riscos V0 — regras absolutas sempre ativas", () => {
  it("presentes mesmo em conversa casual", () => {
    const r = executarPipeline("Oi Luna, bom dia!");
    expect(r.politica.diretrizes_ativas).toContain("identidade.transparencia_sobre_simulacao");
    expect(r.politica.diretrizes_ativas).toContain("seguranca.bloquear_sem_permissao");
  });
});
