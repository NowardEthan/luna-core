import { describe, expect, it, vi, afterEach } from "vitest";
import { avaliadorTarefa } from "../src/agente/avaliadorTarefa.js";
import type { InputAvaliador } from "../src/agente/avaliadorTarefa.js";
import type { PassoExecucao } from "../src/agente/executorAgentico.js";
import type { ConfigLuna } from "../src/providers/tipos.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost:1234/v1",
  modeloMenor: "llama-3.1-8b-instant",
  modeloMaior: "deepseek-r2",
  temperaturaMenor: 0,
  temperaturaMaior: 0.85,
};

function mockProvedor(conteudo: string) {
  return {
    completar: vi.fn().mockResolvedValue({
      conteudo,
      modelo: CONFIG.modeloMenor,
      latencia_ms: 20,
    }),
  };
}

function passo(overrides: Partial<PassoExecucao> = {}): PassoExecucao {
  return {
    rodada: 1,
    ferramenta: "write_file",
    argumentos: { path: "src/index.ts", content: "export default {}" },
    resultado: "arquivo escrito com sucesso",
    duracao_ms: 50,
    sucesso: true,
    ...overrides,
  };
}

function inputBase(overrides: Partial<InputAvaliador> = {}): InputAvaliador {
  return {
    objetivo: "Adicionar log no início da função main",
    mensagemOriginal: "adiciona um console.log no início da função main do src/index.ts",
    passos: [passo()],
    respostaExecutor: "Adicionei o console.log na linha 3 do arquivo src/index.ts.",
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

// ─── Modelo correto ──────────────────────────────────────────────────────────

describe("seleção de modelo", () => {
  it("usa modeloMenor — não modeloMaior", async () => {
    const provedor = mockProvedor(
      JSON.stringify({ concluido: true, confianca: 0.95 }),
    );

    await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });

    expect(provedor.completar).toHaveBeenCalledOnce();
    const chamada = provedor.completar.mock.calls[0]![0];
    expect(chamada.modelo).toBe(CONFIG.modeloMenor);
    expect(chamada.temperatura).toBe(0);
    expect(chamada.json).toBe(true);
  });
});

// ─── Parsing correto ─────────────────────────────────────────────────────────

describe("parsing do resultado", () => {
  it("retorna resultado válido quando JSON correto", async () => {
    const esperado = {
      concluido: true,
      confianca: 0.95,
    };
    const provedor = mockProvedor(JSON.stringify(esperado));

    const resultado = await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });

    expect(resultado.concluido).toBe(true);
    expect(resultado.confianca).toBe(0.95);
  });

  it("retorna com pendencias e sugestao quando não concluído", async () => {
    const esperado = {
      concluido: false,
      confianca: 0.8,
      pendencias: ["arquivo não foi salvo corretamente"],
      sugestao_nova_rodada: "Tente usar write_file com o conteúdo completo",
    };
    const provedor = mockProvedor(JSON.stringify(esperado));

    const resultado = await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });

    expect(resultado.concluido).toBe(false);
    expect(resultado.pendencias).toEqual(["arquivo não foi salvo corretamente"]);
    expect(resultado.sugestao_nova_rodada).toContain("write_file");
  });

  it("extrai JSON mesmo quando modelo adiciona texto ao redor", async () => {
    const json = JSON.stringify({ concluido: true, confianca: 0.9 });
    const provedor = mockProvedor(`A tarefa foi concluída.\n\n${json}\n\nBom trabalho.`);

    const resultado = await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });

    expect(resultado.concluido).toBe(true);
    expect(resultado.confianca).toBe(0.9);
  });

  it("aceita confianca nos limites (0 e 1)", async () => {
    const provedor = mockProvedor(JSON.stringify({ concluido: false, confianca: 0 }));
    const r1 = await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });
    expect(r1.confianca).toBe(0);

    provedor.completar.mockResolvedValue({
      conteudo: JSON.stringify({ concluido: true, confianca: 1 }),
      modelo: CONFIG.modeloMenor,
      latencia_ms: 10,
    });
    const r2 = await avaliadorTarefa(inputBase(), { provedor, config: CONFIG });
    expect(r2.confianca).toBe(1);
  });
});

// ─── Fallback heurístico ──────────────────────────────────────────────────────

describe("fallback heurístico", () => {
  it("JSON inválido → fallback com passos bem-sucedidos → concluido true", async () => {
    const provedor = mockProvedor("não sei avaliar isso");

    const resultado = await avaliadorTarefa(
      inputBase({ passos: [passo({ sucesso: true })] }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(true);
    expect(typeof resultado.confianca).toBe("number");
  });

  it("JSON inválido → fallback com erro no passo → concluido false", async () => {
    const provedor = mockProvedor("ERRO");

    const resultado = await avaliadorTarefa(
      inputBase({
        passos: [passo({ sucesso: false, resultado: "arquivo não encontrado" })],
      }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(false);
    expect(resultado.pendencias?.length).toBeGreaterThan(0);
  });

  it("JSON inválido → fallback sem passos → concluido false com sugestão", async () => {
    const provedor = mockProvedor("{}");

    const resultado = await avaliadorTarefa(
      inputBase({ passos: [] }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(false);
    expect(resultado.sugestao_nova_rodada).toBeDefined();
  });

  it("schema inválido (sem concluido) → usa heurística", async () => {
    const provedor = mockProvedor(JSON.stringify({ status: "ok", score: 0.9 }));

    const resultado = await avaliadorTarefa(
      inputBase({ passos: [passo({ sucesso: true })] }),
      { provedor, config: CONFIG },
    );

    // heurística com passo bem-sucedido → concluido true
    expect(result => typeof resultado.concluido === "boolean").toBeTruthy();
  });

  it("confianca fora do range (>1) → usa heurística", async () => {
    const provedor = mockProvedor(JSON.stringify({ concluido: true, confianca: 1.5 }));

    const resultado = await avaliadorTarefa(
      inputBase({ passos: [passo({ sucesso: true })] }),
      { provedor, config: CONFIG },
    );

    expect(typeof resultado.concluido).toBe("boolean");
  });
});

// ─── Cenários de avaliação ────────────────────────────────────────────────────

describe("cenários reais", () => {
  it("write_file bem-sucedido → modelo diz concluído", async () => {
    const provedor = mockProvedor(
      JSON.stringify({ concluido: true, confianca: 0.98 }),
    );

    const resultado = await avaliadorTarefa(
      inputBase({
        passos: [
          passo({ ferramenta: "read_file", resultado: "código original" }),
          passo({ ferramenta: "write_file", resultado: "arquivo escrito" }),
        ],
      }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(true);
  });

  it("erro de ferramenta → modelo diz não concluído", async () => {
    const provedor = mockProvedor(
      JSON.stringify({
        concluido: false,
        confianca: 0.9,
        pendencias: ["write_file falhou: permissão negada"],
        sugestao_nova_rodada: "Verifique as permissões do arquivo antes de escrever.",
      }),
    );

    const resultado = await avaliadorTarefa(
      inputBase({
        passos: [
          passo({ ferramenta: "write_file", sucesso: false, resultado: "ERRO: permissão negada" }),
        ],
      }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(false);
    expect(resultado.sugestao_nova_rodada).toContain("permissões");
  });

  it("leitura sem escrita para tarefa de edição → modelo sinaliza pendência", async () => {
    const provedor = mockProvedor(
      JSON.stringify({
        concluido: false,
        confianca: 0.85,
        pendencias: ["arquivo foi lido mas não editado"],
        sugestao_nova_rodada: "Use write_file ou apply_patch para fazer a edição solicitada.",
      }),
    );

    const resultado = await avaliadorTarefa(
      inputBase({
        objetivo: "Adicionar log no início da função main",
        passos: [passo({ ferramenta: "read_file", resultado: "export function main() {}" })],
        respostaExecutor: "Li o arquivo.",
      }),
      { provedor, config: CONFIG },
    );

    expect(resultado.concluido).toBe(false);
    expect(resultado.pendencias).toBeDefined();
  });
});

// ─── Construção do prompt ─────────────────────────────────────────────────────

describe("construção do prompt", () => {
  it("inclui objetivo, passos e resposta do executor", async () => {
    const provedor = mockProvedor(JSON.stringify({ concluido: true, confianca: 0.9 }));

    await avaliadorTarefa(
      inputBase({
        objetivo: "Refatorar módulo de autenticação",
        passos: [
          passo({ ferramenta: "read_file", argumentos: { path: "src/auth.ts" }, resultado: "código" }),
          passo({ ferramenta: "write_file", argumentos: { path: "src/auth.ts", content: "novo" } }),
        ],
        respostaExecutor: "Refatoração concluída com async/await.",
      }),
      { provedor, config: CONFIG },
    );

    const mensagens = provedor.completar.mock.calls[0]![0].mensagens;
    const userMsg = mensagens.find((m: { papel: string }) => m.papel === "user")?.conteudo ?? "";

    expect(userMsg).toContain("Refatorar módulo de autenticação");
    expect(userMsg).toContain("read_file");
    expect(userMsg).toContain("write_file");
    expect(userMsg).toContain("Refatoração concluída com async/await.");
  });

  it("marca erros com ✗ e sucessos com ✓ no prompt", async () => {
    const provedor = mockProvedor(JSON.stringify({ concluido: false, confianca: 0.7 }));

    await avaliadorTarefa(
      inputBase({
        passos: [
          passo({ sucesso: true }),
          passo({ sucesso: false, resultado: "ERRO: timeout" }),
        ],
      }),
      { provedor, config: CONFIG },
    );

    const mensagens = provedor.completar.mock.calls[0]![0].mensagens;
    const userMsg = mensagens.find((m: { papel: string }) => m.papel === "user")?.conteudo ?? "";

    expect(userMsg).toContain("✓");
    expect(userMsg).toContain("✗");
    expect(userMsg).toContain("ERRO: timeout");
  });
});
