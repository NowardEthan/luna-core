import { describe, expect, it, vi, afterEach } from "vitest";
import { planejadorIde } from "../src/agente/planejadorIde.js";
import type { InputPlanejador, SnapshotWorkspace } from "../src/agente/planejadorIde.js";
import type { ConfigLuna } from "../src/providers/tipos.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const SNAPSHOT_BASE: SnapshotWorkspace = {
  workspaceRoot: "/projeto/orbit",
  arquivosAbertos: ["src/index.ts", "src/utils/helpers.ts"],
  arquivoAtivo: "src/index.ts",
};

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
      modelo: CONFIG.modeloMaior,
      latencia_ms: 50,
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

// ─── Modelo correto ──────────────────────────────────────────────────────────

describe("seleção de modelo", () => {
  it("usa modeloMaior — não modeloMenor", async () => {
    const provedor = mockProvedor(
      JSON.stringify({
        objetivo: "refatorar função",
        tipo: "edicao",
        arquivos_relevantes: ["src/index.ts"],
        ferramentas_previstas: ["read_file", "write_file"],
        complexidade: "media",
        requer_confirmacao: false,
      }),
    );

    await planejadorIde(
      { mensagemUsuario: "refatora a função main", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(provedor.completar).toHaveBeenCalledOnce();
    const chamada = provedor.completar.mock.calls[0]![0];
    expect(chamada.modelo).toBe(CONFIG.modeloMaior);
    expect(chamada.temperatura).toBe(0);
    expect(chamada.json).toBe(true);
  });
});

// ─── Parsing correto ─────────────────────────────────────────────────────────

describe("parsing do plano", () => {
  it("retorna plano válido quando JSON correto", async () => {
    const planoEsperado = {
      objetivo: "Ler o arquivo e explicar a função",
      tipo: "leitura",
      arquivos_relevantes: ["src/index.ts"],
      ferramentas_previstas: ["read_file"],
      complexidade: "baixa",
      requer_confirmacao: false,
      contexto_adicional: "Apenas leitura, sem edição",
    };
    const provedor = mockProvedor(JSON.stringify(planoEsperado));

    const resultado = await planejadorIde(
      { mensagemUsuario: "o que faz o método Z?", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(resultado).toEqual(planoEsperado);
  });

  it("extrai JSON mesmo quando modelo adiciona texto antes e depois", async () => {
    const plano = {
      objetivo: "editar arquivo",
      tipo: "edicao",
      arquivos_relevantes: ["src/index.ts"],
      ferramentas_previstas: ["write_file"],
      complexidade: "media",
      requer_confirmacao: false,
    };
    const provedor = mockProvedor(
      `Aqui está o plano:\n\n${JSON.stringify(plano)}\n\nEspero que ajude.`,
    );

    const resultado = await planejadorIde(
      { mensagemUsuario: "adiciona log no início", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(resultado.objetivo).toBe("editar arquivo");
    expect(resultado.tipo).toBe("edicao");
  });

  it("retorna plano fallback quando modelo retorna JSON inválido", async () => {
    const provedor = mockProvedor("Não sei fazer isso.");

    const resultado = await planejadorIde(
      { mensagemUsuario: "refatora o módulo X", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(resultado.objetivo).toBeDefined();
    expect(typeof resultado.tipo).toBe("string");
    expect(Array.isArray(resultado.arquivos_relevantes)).toBe(true);
    expect(Array.isArray(resultado.ferramentas_previstas)).toBe(true);
    expect(typeof resultado.requer_confirmacao).toBe("boolean");
  });

  it("retorna plano fallback quando JSON tem schema incorreto", async () => {
    const provedor = mockProvedor('{"foo": "bar"}');

    const resultado = await planejadorIde(
      { mensagemUsuario: "cria um arquivo novo", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    // fallback detecta "cria" → tipo edicao
    expect(resultado.tipo).toBe("edicao");
  });
});

// ─── Tipos de pedido — fallback inteligente ──────────────────────────────────

describe("fallback por tipo de pedido", () => {
  it("pedido de leitura → fallback tipo leitura", async () => {
    const provedor = mockProvedor("ERRO");

    const resultado = await planejadorIde(
      { mensagemUsuario: "o que faz essa função?", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(resultado.tipo).toBe("leitura");
    expect(resultado.requer_confirmacao).toBe(false);
  });

  it("pedido de terminal → fallback tipo terminal", async () => {
    const provedor = mockProvedor("ERRO");

    const resultado = await planejadorIde(
      {
        mensagemUsuario: "roda os testes e me diz o que falhou",
        snapshotWorkspace: SNAPSHOT_BASE,
      },
      { provedor, config: CONFIG },
    );

    expect(resultado.tipo).toBe("terminal");
  });

  it("pedido de commit → fallback tipo git com requer_confirmacao", async () => {
    const provedor = mockProvedor("ERRO");

    const resultado = await planejadorIde(
      { mensagemUsuario: "faz um commit com as mudanças", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    expect(resultado.tipo).toBe("git");
    expect(resultado.requer_confirmacao).toBe(true);
  });
});

// ─── Contexto injetado no prompt ─────────────────────────────────────────────

describe("construção do prompt", () => {
  it("inclui snapshot do workspace na mensagem do usuário", async () => {
    const provedor = mockProvedor(
      JSON.stringify({
        objetivo: "teste",
        tipo: "leitura",
        arquivos_relevantes: [],
        ferramentas_previstas: [],
        complexidade: "baixa",
        requer_confirmacao: false,
      }),
    );

    await planejadorIde(
      {
        mensagemUsuario: "lê o arquivo",
        snapshotWorkspace: {
          workspaceRoot: "/meu/projeto",
          arquivosAbertos: ["src/App.tsx"],
          arquivoAtivo: "src/App.tsx",
          gitStatus: "M src/App.tsx",
        },
        memoriaLonga: ["o projeto usa React 18"],
      },
      { provedor, config: CONFIG },
    );

    const mensagens = provedor.completar.mock.calls[0]![0].mensagens;
    const userMsg = mensagens.find((m: { papel: string }) => m.papel === "user")?.conteudo ?? "";

    expect(userMsg).toContain("/meu/projeto");
    expect(userMsg).toContain("src/App.tsx");
    expect(userMsg).toContain("M src/App.tsx");
    expect(userMsg).toContain("o projeto usa React 18");
  });

  it("system prompt menciona ferramentas disponíveis", async () => {
    const provedor = mockProvedor('{"objetivo":"x","tipo":"leitura","arquivos_relevantes":[],"ferramentas_previstas":[],"complexidade":"baixa","requer_confirmacao":false}');

    await planejadorIde(
      { mensagemUsuario: "lê o arquivo", snapshotWorkspace: SNAPSHOT_BASE },
      { provedor, config: CONFIG },
    );

    const mensagens = provedor.completar.mock.calls[0]![0].mensagens;
    const sysMsg = mensagens.find((m: { papel: string }) => m.papel === "system")?.conteudo ?? "";

    expect(sysMsg).toContain("read_file");
    expect(sysMsg).toContain("write_file");
    expect(sysMsg).toContain("run_terminal_command");
    expect(sysMsg).toContain("git_commit");
  });
});
