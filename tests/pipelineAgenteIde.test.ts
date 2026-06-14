import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { executarAgenteIde } from "../src/pipeline/executarAgenteIde.js";
import type { OpcoesPipelineIde } from "../src/pipeline/executarAgenteIde.js";
import type { ConfigLuna, ProvedorAgente } from "../src/providers/tipos.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CONFIG: ConfigLuna = {
  apiKey: "test-key",
  baseUrl: "http://localhost:1234/v1",
  modeloMenor: "llama-3.1-8b-instant",
  modeloMaior: "deepseek-r2",
  temperaturaMenor: 0,
  temperaturaMaior: 0.85,
};

// Provedor que sempre responde com texto direto (sem tool calls)
function provedorTexto(conteudo: string): ProvedorAgente {
  return {
    completar: vi.fn().mockResolvedValue({ conteudo, modelo: CONFIG.modeloMaior, latencia_ms: 10 }),
    completarComFerramentas: vi.fn().mockResolvedValue({
      conteudo,
      modelo: CONFIG.modeloMaior,
      latencia_ms: 10,
    }),
  };
}

// Provedor para planejador (completar) + executor (completarComFerramentas)
function provedorCompleto(opts: {
  planoJson?: object;
  respostaExecutor?: string;
  respostaAvaliador?: object;
}): ProvedorAgente {
  const plano = opts.planoJson ?? {
    objetivo: "tarefa de teste",
    tipo: "leitura",
    arquivos_relevantes: [],
    ferramentas_previstas: ["read_file"],
    complexidade: "media",
    requer_confirmacao: false,
  };
  const avalJson = opts.respostaAvaliador ?? { concluido: true, confianca: 0.9 };

  let completarCalls = 0;
  return {
    completar: vi.fn().mockImplementation(async () => {
      completarCalls++;
      // 1ª chamada = planejador, 2ª+ = avaliador
      const json = completarCalls === 1 ? plano : avalJson;
      return { conteudo: JSON.stringify(json), modelo: CONFIG.modeloMenor, latencia_ms: 10 };
    }),
    completarComFerramentas: vi.fn().mockResolvedValue({
      conteudo: opts.respostaExecutor ?? "Tarefa concluída.",
      modelo: CONFIG.modeloMaior,
      latencia_ms: 10,
    }),
  };
}

function opcoesBase(overrides: Partial<OpcoesPipelineIde> = {}): OpcoesPipelineIde {
  return {
    snapshotWorkspace: {
      workspaceRoot: "/proj",
      arquivosAbertos: [],
    },
    toolExecutor: vi.fn().mockResolvedValue("resultado"),
    provedor: provedorTexto("Resposta direta."),
    config: CONFIG,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

// ─── Config ausente ───────────────────────────────────────────────────────────

describe("config ausente", () => {
  beforeEach(() => {
    vi.stubEnv("LUNA_API_KEY", "");
  });

  it("retorna erro amigável quando config é undefined e não há env", async () => {
    const resultado = await executarAgenteIde(
      "lê o arquivo",
      opcoesBase({ config: undefined }),
    );
    expect(resultado.resposta).toContain("Configuração de API ausente");
    expect(resultado.passos).toHaveLength(0);
  });
});

// ─── Profundidade correta ─────────────────────────────────────────────────────

describe("tálamo determinístico", () => {
  it("mensagem curta → profundidade simples, sem planejador", async () => {
    const provedor = provedorCompleto({});
    const resultado = await executarAgenteIde("ok", opcoesBase({ provedor }));

    // profundidade simples → completar (planejador) não deve ter sido chamado
    expect(provedor.completar).not.toHaveBeenCalled();
    expect(resultado.profundidade).toBe("simples");
    expect(resultado.plano).toBeUndefined();
  });

  it("mensagem técnica longa → profundidade complexo, planejador chamado", async () => {
    const provedor = provedorCompleto({});
    const resultado = await executarAgenteIde(
      "refatora o módulo de autenticação para usar async/await e TypeScript correto",
      opcoesBase({ provedor }),
    );

    expect(provedor.completar).toHaveBeenCalled();
    expect(resultado.profundidade).toBe("complexo");
    expect(resultado.plano).toBeDefined();
  });

  it("mensagem moderada → planejador chamado", async () => {
    const provedor = provedorCompleto({});
    await executarAgenteIde(
      "adiciona um console.log no início da função main",
      opcoesBase({ provedor }),
    );

    expect(provedor.completar).toHaveBeenCalled();
  });
});

// ─── Executor recebe plano ────────────────────────────────────────────────────

describe("plano injetado no executor", () => {
  it("executor recebe plano quando planejador rodou", async () => {
    const provedor = provedorCompleto({
      planoJson: {
        objetivo: "adicionar log",
        tipo: "edicao",
        arquivos_relevantes: ["src/main.ts"],
        ferramentas_previstas: ["write_file"],
        complexidade: "media",
        requer_confirmacao: false,
      },
    });

    await executarAgenteIde(
      "adiciona um console.log na função main",
      opcoesBase({ provedor }),
    );

    const chamadaExecutor = provedor.completarComFerramentas.mock.calls[0]![0];
    const userMsg = chamadaExecutor.mensagens.find(
      (m: { papel: string }) => m.papel === "user",
    )?.conteudo ?? "";

    expect(userMsg).toContain("[PLANO DE EXECUÇÃO]");
    expect(userMsg).toContain("adicionar log");
  });
});

// ─── Avaliador só em complexo/crítico ─────────────────────────────────────────

describe("ativação do avaliador", () => {
  it("não chama avaliador para mensagem simples", async () => {
    const provedor = provedorCompleto({});
    const resultado = await executarAgenteIde("oi", opcoesBase({ provedor }));

    expect(resultado.avaliacao).toBeUndefined();
    // completar só pode ter sido chamado para o planejador (que não roda em simples)
    expect(provedor.completar).not.toHaveBeenCalled();
  });

  it("não chama avaliador quando executor não executou ferramentas (passos=0)", async () => {
    const provedor = provedorCompleto({});
    // Mensagem técnica mas executor responde direto sem tool calls
    const resultado = await executarAgenteIde(
      "como funciona o TypeScript decorators?",
      opcoesBase({ provedor }),
    );

    expect(resultado.avaliacao).toBeUndefined();
  });

  it("chama avaliador quando complexo + ferramentas usadas", async () => {
    const provedor: ProvedorAgente = {
      completar: vi.fn().mockImplementation(async () => ({
        conteudo: JSON.stringify({
          objetivo: "refatora função",
          tipo: "edicao",
          arquivos_relevantes: ["src/index.ts"],
          ferramentas_previstas: ["write_file"],
          complexidade: "alta",
          requer_confirmacao: false,
        }),
        modelo: CONFIG.modeloMenor,
        latencia_ms: 10,
      })),
      completarComFerramentas: vi.fn()
        .mockResolvedValueOnce({
          // primeira chamada: executor pede ferramenta
          chamadas: [{ id: "c1", nome: "write_file", argumentos: { path: "src/index.ts", content: "x" } }],
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        })
        .mockResolvedValueOnce({
          // segunda chamada: executor responde com texto
          conteudo: "Arquivo editado.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        }),
    };

    const resultado = await executarAgenteIde(
      "refatora o módulo de autenticação com async/await e TypeScript",
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue("ok"),
      }),
    );

    expect(resultado.passos.length).toBeGreaterThan(0);
    // avaliador deve ter sido chamado (completar 2ª vez = avaliador)
    expect(provedor.completar).toHaveBeenCalledTimes(2);
    expect(resultado.avaliacao).toBeDefined();
  });
});

// ─── Retry do avaliador ───────────────────────────────────────────────────────

describe("retry do executor via avaliador", () => {
  it("faz retry quando avaliador detecta pendência com confiança >= 0.65", async () => {
    let completarCalls = 0;
    const provedor: ProvedorAgente = {
      completar: vi.fn().mockImplementation(async () => {
        completarCalls++;
        if (completarCalls === 1) {
          // Planejador
          return {
            conteudo: JSON.stringify({
              objetivo: "editar arquivo",
              tipo: "edicao",
              arquivos_relevantes: ["a.ts"],
              ferramentas_previstas: ["read_file", "write_file"],
              complexidade: "alta",
              requer_confirmacao: false,
            }),
            modelo: CONFIG.modeloMenor,
            latencia_ms: 10,
          };
        }
        if (completarCalls === 2) {
          // Avaliador 1ª vez → pendente (só leu, não escreveu)
          return {
            conteudo: JSON.stringify({
              concluido: false,
              confianca: 0.8,
              pendencias: ["arquivo não foi modificado"],
              sugestao_nova_rodada: "Use write_file para salvar as mudanças em a.ts",
            }),
            modelo: CONFIG.modeloMenor,
            latencia_ms: 10,
          };
        }
        // Avaliador 2ª vez → concluído
        return {
          conteudo: JSON.stringify({ concluido: true, confianca: 0.95 }),
          modelo: CONFIG.modeloMenor,
          latencia_ms: 10,
        };
      }),
      completarComFerramentas: vi.fn()
        // Executor principal: pede read_file
        .mockResolvedValueOnce({
          chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "a.ts" } }],
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        })
        // Executor principal: responde com texto após ler
        .mockResolvedValueOnce({ conteudo: "Li o arquivo.", modelo: CONFIG.modeloMaior, latencia_ms: 10 })
        // Executor retry: pede write_file
        .mockResolvedValueOnce({
          chamadas: [{ id: "c2", nome: "write_file", argumentos: { path: "a.ts", content: "novo" } }],
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        })
        // Executor retry: conclui após escrever
        .mockResolvedValueOnce({ conteudo: "Arquivo salvo.", modelo: CONFIG.modeloMaior, latencia_ms: 10 }),
    };

    const toolExecutor = vi.fn().mockResolvedValue("ok");
    const resultado = await executarAgenteIde(
      "refatora o módulo com TypeScript correto e async/await",
      opcoesBase({ provedor, toolExecutor }),
    );

    // Retry aconteceu → passos acumulados (read do principal + write do retry)
    expect(resultado.passos.length).toBe(2);
    // Avaliador foi chamado 2x (1ª pendente + 2ª concluído) + 1 planejador = 3 total
    expect(completarCalls).toBeGreaterThanOrEqual(3);
    // Avaliação final deve ser concluída
    expect(resultado.avaliacao?.concluido).toBe(true);
  });
});

// ─── Callbacks de progresso ───────────────────────────────────────────────────

describe("callbacks", () => {
  it("dispara onStatusHint ao longo do pipeline", async () => {
    const hints: string[] = [];
    const provedor = provedorTexto("Pronto.");

    await executarAgenteIde(
      "o que faz essa função?",
      opcoesBase({
        provedor,
        onStatusHint: (h) => hints.push(h),
      }),
    );

    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("analis"))).toBe(true);
  });

  it("dispara onToolCallStart e onToolCallComplete quando ferramenta é usada", async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();

    const provedor: ProvedorAgente = {
      completar: vi.fn().mockResolvedValue({
        conteudo: JSON.stringify({
          objetivo: "ler arquivo",
          tipo: "leitura",
          arquivos_relevantes: [],
          ferramentas_previstas: ["read_file"],
          complexidade: "media",
          requer_confirmacao: false,
        }),
        modelo: CONFIG.modeloMenor,
        latencia_ms: 10,
      }),
      completarComFerramentas: vi.fn()
        .mockResolvedValueOnce({
          chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "src/index.ts" } }],
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        })
        .mockResolvedValueOnce({
          conteudo: "Lido.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        }),
    };

    await executarAgenteIde(
      "lê o arquivo src/index.ts e explica o que faz",
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue("conteúdo"),
        onToolCallStart: onStart,
        onToolCallComplete: onComplete,
      }),
    );

    expect(onStart).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ─── Abort signal ─────────────────────────────────────────────────────────────

describe("abort signal", () => {
  it("retorna resposta de cancelamento imediatamente quando sinal já abortado", async () => {
    const controller = new AbortController();
    controller.abort();
    const provedor = provedorTexto("nunca");

    const resultado = await executarAgenteIde(
      "lê o arquivo",
      opcoesBase({ provedor, abortSignal: controller.signal }),
    );

    expect(resultado.resposta).toContain("cancelada");
    expect(resultado.concluido ?? resultado.passos.length).toBe(0);
  });
});

// ─── Resultado final ──────────────────────────────────────────────────────────

describe("resultado", () => {
  it("inclui campos de auditoria: rodadas, latencia_total_ms, profundidade", async () => {
    const resultado = await executarAgenteIde(
      "qual é a função main?",
      opcoesBase(),
    );

    expect(typeof resultado.rodadas).toBe("number");
    expect(resultado.latencia_total_ms).toBeGreaterThanOrEqual(0);
    expect(["simples", "moderado", "complexo", "critico"]).toContain(resultado.profundidade);
  });

  it("retorna a resposta do executor no campo resposta", async () => {
    const resultado = await executarAgenteIde(
      "oi",
      opcoesBase({ provedor: provedorTexto("Olá! Como posso ajudar?") }),
    );

    expect(resultado.resposta).toBe("Olá! Como posso ajudar?");
  });
});
