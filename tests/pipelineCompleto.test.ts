import { describe, expect, it, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { criarProvedorMock } from "../src/providers/mockProvedor.js";
import { executarPipelineCompleto } from "../src/pipeline/executarPipelineCompleto.js";
import { PASTA_LOGS } from "../src/logs/registradorDecisao.js";
import type { ConfigLuna } from "../src/providers/tipos.js";

const CONFIG_TESTE: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost",
  modeloMenor: "modelo-menor-teste",
  modeloMaior: "modelo-maior-teste",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

const ANALISE_CASUAL = JSON.stringify({
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.85,
  motivos: ["Saudação informal"],
});

const ANALISE_ERRADA_DESTRUTIVA = JSON.stringify({
  intencao: "conversa_casual",
  complexidade: "baixa",
  nivel_risco: "nenhum",
  requer_markdown: false,
  requer_codigo: false,
  requer_ferramenta: false,
  requer_memoria: false,
  deve_perguntar_mais: false,
  confianca: 0.5,
  motivos: ["LLM errou de propósito no teste"],
});

describe("Pipeline V0.3 — completo", () => {
  let logsCriados: string[] = [];

  afterEach(() => {
    for (const caminho of logsCriados) {
      if (existsSync(caminho)) rmSync(caminho, { force: true });
    }
    logsCriados = [];
  });

  it("integra analisador LLM + política + respondedor + log", async () => {
    const provedor = criarProvedorMock({
      "modelo-menor-teste": ANALISE_CASUAL,
      "modelo-maior-teste": "Olá! Tudo bem por aqui — como posso te ajudar?",
    });

    const resultado = await executarPipelineCompleto("Oi Luna!", {
      provedor,
      config: CONFIG_TESTE,
    });

    expect(resultado.analise.fonte).toBe("llm");
    expect(resultado.pipeline.politica.tom).toBe("casual");
    expect(resultado.resposta?.texto).toContain("Olá");
    expect(existsSync(resultado.log_path)).toBe(true);

    const log = JSON.parse(readFileSync(resultado.log_path, "utf-8")) as {
      resposta_luna: string;
      analise_fonte: string;
    };
    expect(log.analise_fonte).toBe("llm");
    expect(log.resposta_luna).toContain("Olá");
    logsCriados.push(resultado.log_path);
  });

  it("léxico corrige LLM errada em ação destrutiva externa", async () => {
    const provedor = criarProvedorMock({
      "modelo-menor-teste": ANALISE_ERRADA_DESTRUTIVA,
      "modelo-maior-teste": "Não posso fazer isso sem confirmação.",
    });

    const resultado = await executarPipelineCompleto(
      "Apague os arquivos de outro computador",
      { provedor, config: CONFIG_TESTE },
    );

    expect(resultado.pipeline.analise.intencao).toBe("acao_critica");
    expect(resultado.pipeline.analise.nivel_risco).toBe("critico");
    expect(resultado.pipeline.politica.autonomia).toBe("nenhuma");
    expect(resultado.pipeline.politica.acao).toBe("bloquear");
    logsCriados.push(resultado.log_path);
  });

  it("salva log em logs/interacoes/YYYY-MM-DD/", async () => {
    const provedor = criarProvedorMock({
      "modelo-menor-teste": ANALISE_CASUAL,
      "modelo-maior-teste": "Resposta teste",
    });

    const resultado = await executarPipelineCompleto("Teste log", {
      provedor,
      config: CONFIG_TESTE,
    });

    expect(resultado.log_path).toContain(PASTA_LOGS);
    expect(resultado.log_path).toMatch(/\d{4}-\d{2}-\d{2}/);
    logsCriados.push(resultado.log_path);
  });
});
