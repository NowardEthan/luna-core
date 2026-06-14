import { describe, expect, it, vi, afterEach } from "vitest";
import { executorAgentico } from "../src/agente/executorAgentico.js";
import type { OpcoeExecutor } from "../src/agente/executorAgentico.js";
import type { ConfigLuna } from "../src/providers/tipos.js";
import { FERRAMENTAS_IDE } from "../src/agente/ferramentas/definicoes.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost:1234/v1",
  modeloMenor: "llama-3.1-8b-instant",
  modeloMaior: "deepseek-r2",
  temperaturaMenor: 0,
  temperaturaMaior: 0.85,
};

function provedorTexto(conteudo: string) {
  return {
    completar: vi.fn(),
    completarComFerramentas: vi.fn().mockResolvedValue({
      conteudo,
      modelo: CONFIG.modeloMaior,
      latencia_ms: 10,
    }),
  };
}

function provedorChamadas(
  chamadas: Array<{ id: string; nome: string; argumentos: Record<string, unknown> }>,
  respostaFinal = "Pronto.",
) {
  let rodada = 0;
  return {
    completar: vi.fn(),
    completarComFerramentas: vi.fn().mockImplementation(async () => {
      rodada++;
      if (rodada === 1) {
        return { chamadas, modelo: CONFIG.modeloMaior, latencia_ms: 10 };
      }
      return { conteudo: respostaFinal, modelo: CONFIG.modeloMaior, latencia_ms: 10 };
    }),
  };
}

function opcoesBase(overrides: Partial<OpcoeExecutor> = {}): OpcoeExecutor {
  return {
    mensagemUsuario: "lê o arquivo src/index.ts",
    systemPrompt: "Você é um agente de código.",
    ferramentas: FERRAMENTAS_IDE,
    toolExecutor: vi.fn().mockResolvedValue("conteúdo do arquivo"),
    provedor: provedorTexto("Resposta direta."),
    config: CONFIG,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

// ─── Modelo correto ──────────────────────────────────────────────────────────

describe("seleção de modelo", () => {
  it("usa modeloMaior e temperaturaMaior", async () => {
    const provedor = provedorTexto("Resposta.");
    await executorAgentico(opcoesBase({ provedor }));

    const chamada = provedor.completarComFerramentas.mock.calls[0]![0];
    expect(chamada.modelo).toBe(CONFIG.modeloMaior);
    expect(chamada.temperatura).toBe(CONFIG.temperaturaMaior);
  });

  it("envia ferramentas na requisição", async () => {
    const provedor = provedorTexto("Resposta.");
    await executorAgentico(opcoesBase({ provedor }));

    const chamada = provedor.completarComFerramentas.mock.calls[0]![0];
    expect(chamada.ferramentas).toBeDefined();
    expect(chamada.ferramentas.length).toBeGreaterThan(0);
  });
});

// ─── Loop termina com texto ───────────────────────────────────────────────────

describe("resposta direta (sem ferramentas)", () => {
  it("retorna conteudo quando modelo responde com texto imediatamente", async () => {
    const resultado = await executorAgentico(opcoesBase());

    expect(resultado.resposta_final).toBe("Resposta direta.");
    expect(resultado.concluido).toBe(true);
    expect(resultado.passos).toHaveLength(0);
    expect(resultado.rodadas).toBe(1);
  });
});

// ─── Loop com tool calls ──────────────────────────────────────────────────────

describe("loop com ferramentas", () => {
  it("executa ferramenta e retorna resposta final", async () => {
    const toolExecutor = vi.fn().mockResolvedValue("export default {}");
    const provedor = provedorChamadas(
      [{ id: "call_1", nome: "read_file", argumentos: { path: "src/index.ts" } }],
      "Analisei o arquivo.",
    );

    const resultado = await executorAgentico(
      opcoesBase({ provedor, toolExecutor }),
    );

    expect(toolExecutor).toHaveBeenCalledOnce();
    expect(toolExecutor).toHaveBeenCalledWith("read_file", { path: "src/index.ts" });
    expect(resultado.resposta_final).toBe("Analisei o arquivo.");
    expect(resultado.concluido).toBe(true);
    expect(resultado.passos).toHaveLength(1);
    expect(resultado.passos[0]!.ferramenta).toBe("read_file");
    expect(resultado.passos[0]!.sucesso).toBe(true);
  });

  it("executa múltiplas ferramentas em paralelo na mesma rodada", async () => {
    const toolExecutor = vi.fn().mockResolvedValue("resultado");
    const provedor = provedorChamadas(
      [
        { id: "c1", nome: "read_file", argumentos: { path: "a.ts" } },
        { id: "c2", nome: "read_file", argumentos: { path: "b.ts" } },
      ],
      "Comparei os dois.",
    );

    const resultado = await executorAgentico(opcoesBase({ provedor, toolExecutor }));

    expect(toolExecutor).toHaveBeenCalledTimes(2);
    expect(resultado.passos).toHaveLength(2);
    expect(resultado.rodadas).toBe(2);
  });

  it("injeta mensagens de tool call e resultado corretamente para o modelo", async () => {
    const toolExecutor = vi.fn().mockResolvedValue("conteúdo");
    const provedor = provedorChamadas(
      [{ id: "call_x", nome: "read_file", argumentos: { path: "src/main.ts" } }],
      "Feito.",
    );

    await executorAgentico(opcoesBase({ provedor, toolExecutor }));

    // Segunda chamada ao modelo deve receber o histórico completo
    const segundaChamada = provedor.completarComFerramentas.mock.calls[1]![0];
    const mensagens = segundaChamada.mensagens;

    // system + user + assistant(tool_calls) + ferramenta
    expect(mensagens).toHaveLength(4);
    expect(mensagens[2].papel).toBe("assistant");
    expect(mensagens[2].chamadas_ferramenta).toBeDefined();
    expect(mensagens[3].papel).toBe("ferramenta");
    expect(mensagens[3].id_chamada).toBe("call_x");
    expect(mensagens[3].conteudo).toBe("conteúdo");
  });
});

// ─── Tratamento de erros ──────────────────────────────────────────────────────

describe("erros no toolExecutor", () => {
  it("registra erro no passo mas continua o loop", async () => {
    const toolExecutor = vi
      .fn()
      .mockRejectedValue(new Error("arquivo não encontrado"));
    const provedor = provedorChamadas(
      [{ id: "c1", nome: "read_file", argumentos: { path: "fantasma.ts" } }],
      "Vejo que o arquivo não existe.",
    );

    const resultado = await executorAgentico(opcoesBase({ provedor, toolExecutor }));

    expect(resultado.passos[0]!.sucesso).toBe(false);
    expect(resultado.passos[0]!.resultado).toContain("arquivo não encontrado");
    // Loop continua e modelo responde com texto
    expect(resultado.concluido).toBe(true);
    expect(resultado.resposta_final).toBe("Vejo que o arquivo não existe.");
  });
});

// ─── Failsafe maxRodadas ──────────────────────────────────────────────────────

describe("failsafe", () => {
  it("para em maxRodadas quando modelo nunca responde com texto", async () => {
    const toolExecutor = vi.fn().mockResolvedValue("ok");
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockResolvedValue({
        // sempre retorna tool_calls, nunca texto
        chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "a.ts" } }],
        modelo: CONFIG.modeloMaior,
        latencia_ms: 5,
      }),
    };

    const resultado = await executorAgentico(
      opcoesBase({ provedor, toolExecutor, maxRodadas: 3 }),
    );

    expect(resultado.rodadas).toBe(3);
    expect(resultado.concluido).toBe(false);
    expect(resultado.resposta_final).toContain("3 rodadas");
  });
});

// ─── Abort signal ────────────────────────────────────────────────────────────

describe("abort signal", () => {
  it("cancela antes da primeira chamada LLM quando já abortado", async () => {
    const controller = new AbortController();
    controller.abort();

    const provedor = provedorTexto("nunca chamado");
    const resultado = await executorAgentico(
      opcoesBase({ provedor, abortSignal: controller.signal }),
    );

    expect(provedor.completarComFerramentas).not.toHaveBeenCalled();
    expect(resultado.concluido).toBe(false);
    expect(resultado.resposta_final).toContain("cancelada");
  });
});

// ─── Plano injetado no prompt ─────────────────────────────────────────────────

describe("injeção do plano", () => {
  it("injeta plano na mensagem do usuário quando fornecido", async () => {
    const provedor = provedorTexto("Feito.");

    await executorAgentico(
      opcoesBase({
        provedor,
        plano: {
          objetivo: "Refatorar função main",
          tipo: "edicao",
          arquivos_relevantes: ["src/index.ts"],
          ferramentas_previstas: ["read_file", "write_file"],
          complexidade: "media",
          requer_confirmacao: false,
        },
      }),
    );

    const mensagens = provedor.completarComFerramentas.mock.calls[0]![0].mensagens;
    const userMsg = mensagens.find((m: { papel: string }) => m.papel === "user")?.conteudo ?? "";

    expect(userMsg).toContain("[PLANO DE EXECUÇÃO]");
    expect(userMsg).toContain("Refatorar função main");
    expect(userMsg).toContain("src/index.ts");
    // mensagem original do usuário também deve estar presente
    expect(userMsg).toContain("lê o arquivo src/index.ts");
  });

  it("não injeta bloco de plano quando plano é undefined", async () => {
    const provedor = provedorTexto("Feito.");

    await executorAgentico(opcoesBase({ provedor, plano: undefined }));

    const mensagens = provedor.completarComFerramentas.mock.calls[0]![0].mensagens;
    const userMsg = mensagens.find((m: { papel: string }) => m.papel === "user")?.conteudo ?? "";

    expect(userMsg).not.toContain("[PLANO");
    expect(userMsg).toBe("lê o arquivo src/index.ts");
  });
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

describe("callbacks de progresso", () => {
  it("dispara onToolCallStart e onToolCallComplete para cada ferramenta", async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const toolExecutor = vi.fn().mockResolvedValue("resultado");
    const provedor = provedorChamadas(
      [
        { id: "c1", nome: "read_file", argumentos: { path: "a.ts" } },
        { id: "c2", nome: "write_file", argumentos: { path: "b.ts", content: "x" } },
      ],
      "Concluído.",
    );

    await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor,
        onToolCallStart: onStart,
        onToolCallComplete: onComplete,
      }),
    );

    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onStart).toHaveBeenNthCalledWith(1, "read_file", { path: "a.ts" }, 1);
    expect(onStart).toHaveBeenNthCalledWith(2, "write_file", { path: "b.ts", content: "x" }, 1);
  });

  it("dispara onStatusHint ao executar ferramenta", async () => {
    const onHint = vi.fn();
    const provedor = provedorChamadas(
      [{ id: "c1", nome: "run_terminal_command", argumentos: { command: "npm test" } }],
      "Testes passaram.",
    );

    await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue("ok"),
        onStatusHint: onHint,
      }),
    );

    expect(onHint).toHaveBeenCalledWith("Executando run_terminal_command…");
  });
});

// ─── Definições de ferramentas ────────────────────────────────────────────────

describe("FERRAMENTAS_IDE", () => {
  it("contém todas as ferramentas esperadas", () => {
    const nomes = FERRAMENTAS_IDE.map((f) => f.nome);
    expect(nomes).toContain("read_file");
    expect(nomes).toContain("write_file");
    expect(nomes).toContain("apply_patch");
    expect(nomes).toContain("list_directory");
    expect(nomes).toContain("glob");
    expect(nomes).toContain("grep");
    expect(nomes).toContain("run_terminal_command");
    expect(nomes).toContain("git_status");
    expect(nomes).toContain("git_diff");
    expect(nomes).toContain("git_commit");
    expect(nomes).toContain("search_codebase");
  });

  it("cada ferramenta tem nome, descrição e parametros válidos", () => {
    for (const f of FERRAMENTAS_IDE) {
      expect(typeof f.nome).toBe("string");
      expect(f.nome.length).toBeGreaterThan(0);
      expect(typeof f.descricao).toBe("string");
      expect(f.descricao.length).toBeGreaterThan(10);
      expect(f.parametros.type).toBe("object");
      expect(typeof f.parametros.properties).toBe("object");
    }
  });
});
