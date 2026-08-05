import { describe, expect, it, vi, afterEach } from "vitest";
import {
  executorAgentico,
  trimLeiturasArtefatoAntigas,
} from "../src/agente/executorAgentico.js";
import type { OpcoeExecutor } from "../src/agente/executorAgentico.js";
import type { ConfigLuna, ProvedorAgente } from "../src/providers/tipos.js";
import type { MensagemChatAgente } from "../src/providers/tipos.js";
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
    expect(resultado.resposta_final).toMatch(/limite de passos|continue/i);
  });
});

// ─── Narração (content + tools na mesma rodada) ───────────────────────────────

describe("narração progressiva", () => {
  it("emite ponte + executa tools + junta na resposta final", async () => {
    const onNarracao = vi.fn();
    let rodada = 0;
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        rodada++;
        if (rodada === 1) {
          return {
            conteudo: "Vou ler o arquivo pra me informar.",
            chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "a.ts" } }],
            modelo: CONFIG.modeloMaior,
            latencia_ms: 10,
          };
        }
        return {
          conteudo: "Entendi. É um módulo pequeno.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        };
      }),
    };

    const resultado = await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue("export {}"),
        onNarracaoRodada: onNarracao,
      }),
    );

    expect(onNarracao).toHaveBeenCalledTimes(2);
    expect(onNarracao.mock.calls[0]![0]).toContain("Vou ler o arquivo");
    expect(onNarracao.mock.calls[1]![0]).toContain("Entendi");
    expect(resultado.resposta_final).toContain("Vou ler o arquivo");
    expect(resultado.resposta_final).toContain("Entendi");
    expect(resultado.passos).toHaveLength(1);
    // Histórico: assistant com content + tool_calls
    const msgs = provedor.completarComFerramentas.mock.calls[1]![0].mensagens;
    expect(msgs[2].papel).toBe("assistant");
    expect(msgs[2].conteudo).toContain("Vou ler");
    expect(msgs[2].chamadas_ferramenta).toBeDefined();
  });
});

// ─── Coleira do plano (não encerrar com ☐) ────────────────────────────────────

describe("coleira do plano", () => {
  it("não encerra com texto-só enquanto há ☐ — nudge e continua", async () => {
    let rodada = 0;
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        rodada++;
        if (rodada === 1) {
          return {
            conteudo: "Pronto, já terminei tudo.",
            modelo: CONFIG.modeloMaior,
            latencia_ms: 5,
          };
        }
        return {
          conteudo: "Agora sim, fechei o passo que faltava.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 5,
        };
      }),
    };

    let abertos = 1;
    const resultado = await executorAgentico(
      opcoesBase({
        provedor,
        planoAindaAberto: () => {
          // Depois do nudge, o «modelo» fecha o ☐ (simula concluir_passo).
          if (rodada >= 2) abertos = 0;
          return abertos > 0
            ? {
                abertos,
                proximoNumero: 2,
                proximo: "reescrever o trecho",
                render: "PLANO:\n☑ 1. ler\n☐ 2. reescrever o trecho",
              }
            : null;
        },
      }),
    );

    // 1ª rodada: texto prematuro → nudge (sem narrar como final); 2ª: fecha
    expect(provedor.completarComFerramentas).toHaveBeenCalledTimes(2);
    const msgsRodada2 = provedor.completarComFerramentas.mock.calls[1]![0].mensagens;
    const nudge = msgsRodada2.find(
      (m: { papel: string; conteudo?: string }) =>
        m.papel === "user" && typeof m.conteudo === "string" && m.conteudo.includes("☐"),
    );
    expect(nudge?.conteudo).toMatch(/passo 2|reescrever/i);
    expect(resultado.resposta_final).toContain("fechei o passo");
    expect(resultado.resposta_final).not.toContain("já terminei tudo");
  });

  it("não encerra com texto-só enquanto artefatoPendenteAuditoria — nudge e continua", async () => {
    let rodada = 0;
    let pendente = true;
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        rodada++;
        if (rodada === 1) {
          return {
            conteudo: "Pronto, já escrevi o capítulo.",
            modelo: CONFIG.modeloMaior,
            latencia_ms: 5,
          };
        }
        return {
          conteudo: "Confirmei o índice — ficou bom.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 5,
        };
      }),
    };

    const resultado = await executorAgentico(
      opcoesBase({
        provedor,
        artefatoPendenteAuditoria: () => {
          if (rodada >= 2) pendente = false;
          return pendente;
        },
      }),
    );

    expect(provedor.completarComFerramentas).toHaveBeenCalledTimes(2);
    const msgsRodada2 = provedor.completarComFerramentas.mock.calls[1]![0].mensagens;
    const nudge = msgsRodada2.find(
      (m: { papel: string; conteudo?: string }) =>
        m.papel === "user" &&
        typeof m.conteudo === "string" &&
        m.conteudo.includes("ainda NÃO conferiu"),
    );
    expect(nudge).toBeDefined();
    expect(resultado.resposta_final).toContain("Confirmei o índice");
    expect(resultado.resposta_final).not.toContain("já escrevi o capítulo");
  });

  it("não encerra em resposta vazia após tools — nudge e continua", async () => {
    let rodada = 0;
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        rodada++;
        if (rodada === 1) {
          return {
            conteudo: "Vou conferir agora.",
            chamadas: [
              { id: "c1", nome: "ler_estrutura", argumentos: { id: "doc1" } },
            ],
            modelo: CONFIG.modeloMaior,
            latencia_ms: 5,
          };
        }
        if (rodada === 2) {
          // Modelo «some» — sem texto nem tools (bug clássico pós-conferência).
          return { modelo: CONFIG.modeloMaior, latencia_ms: 5 };
        }
        return {
          conteudo: "Confirmei — ficou bom.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 5,
        };
      }),
    };

    const resultado = await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue(
          "Estrutura do artefato «Livro» (id: doc1) — índice…",
        ),
        artefatoPendenteAuditoria: () => false,
      }),
    );

    expect(provedor.completarComFerramentas).toHaveBeenCalledTimes(3);
    const msgsRodada3 = provedor.completarComFerramentas.mock.calls[2]![0].mensagens;
    const nudge = msgsRodada3.find(
      (m: { papel: string; conteudo?: string }) =>
        m.papel === "user" &&
        typeof m.conteudo === "string" &&
        m.conteudo.includes("não fechou a resposta"),
    );
    expect(nudge).toBeDefined();
    expect(resultado.resposta_final).toContain("Confirmei — ficou bom");
    expect(resultado.resposta_final).toContain("Vou conferir agora");
  });

  it("trimLeiturasArtefatoAntigas stubba leituras antigas do mesmo id", () => {
    const mensagens: MensagemChatAgente[] = [
      { papel: "system", conteudo: "sys" },
      {
        papel: "ferramenta",
        id_chamada: "a",
        nome: "ler_secao",
        conteudo:
          "Artefato «Livro» (id: doc1) — seção 1 «Cap 1»:\n\n" + "x".repeat(200),
      },
      {
        papel: "ferramenta",
        id_chamada: "b",
        nome: "ler_estrutura",
        conteudo: "Estrutura do artefato «Livro» (id: doc1) — o índice…",
      },
    ];
    trimLeiturasArtefatoAntigas(mensagens);
    expect(mensagens[1]!.conteudo).toMatch(/leitura anterior omitida/i);
    expect(mensagens[2]!.conteudo).toContain("índice");
  });

  it("respeita obterMaxRodadas dinâmico", async () => {
    let teto = 2;
    const toolExecutor = vi.fn().mockResolvedValue("ok");
    const provedor = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockImplementation(async () => {
        teto = 4; // sobe no meio (como planejar faria)
        return {
          chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "a.ts" } }],
          modelo: CONFIG.modeloMaior,
          latencia_ms: 5,
        };
      }),
    };

    const resultado = await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor,
        maxRodadas: 2,
        obterMaxRodadas: () => teto,
      }),
    );

    expect(resultado.rodadas).toBe(4);
    expect(resultado.concluido).toBe(false);
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

  it("dispara onRaciocinioRodada quando o modelo devolve raciocínio", async () => {
    const onRaciocinio = vi.fn();
    const provedor: ProvedorAgente = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn()
        .mockResolvedValueOnce({
          chamadas: [{ id: "c1", nome: "read_file", argumentos: { path: "a.ts" } }],
          raciocinio: "Preciso ler o ficheiro primeiro.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        })
        .mockResolvedValueOnce({
          conteudo: "Feito.",
          modelo: CONFIG.modeloMaior,
          latencia_ms: 10,
        }),
    };

    await executorAgentico(
      opcoesBase({
        provedor,
        toolExecutor: vi.fn().mockResolvedValue("conteúdo"),
        onRaciocinioRodada: onRaciocinio,
      }),
    );

    expect(onRaciocinio).toHaveBeenCalledTimes(2);
    expect(onRaciocinio).toHaveBeenNthCalledWith(
      1,
      1,
      "Preciso ler o ficheiro primeiro.",
      true,
    );
    expect(onRaciocinio).toHaveBeenNthCalledWith(
      2,
      1,
      "Preciso ler o ficheiro primeiro.",
      false,
    );
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
