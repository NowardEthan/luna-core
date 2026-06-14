import { describe, expect, it, vi, afterEach } from "vitest";
import { criarProvedorOpenAi } from "../src/providers/openaiCompativel.js";
import type {
  DefinicaoFerramenta,
  MensagemChatAgente,
} from "../src/providers/tipos.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FERRAMENTA_LEITURA: DefinicaoFerramenta = {
  nome: "read_file",
  descricao: "Lê o conteúdo de um arquivo.",
  parametros: {
    type: "object",
    properties: {
      path: { type: "string", description: "Caminho do arquivo." },
    },
    required: ["path"],
  },
};

const MENSAGENS_BASE: MensagemChatAgente[] = [
  { papel: "system", conteudo: "Você é um agente." },
  { papel: "user", conteudo: "Lê o arquivo src/index.ts" },
];

function mockFetch(resposta: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => resposta,
  } as Response);
}

afterEach(() => vi.restoreAllMocks());

// ─── Serialização ────────────────────────────────────────────────────────────

describe("serialização de mensagens agênticas", () => {
  it("envia tools no formato OpenAI quando fornecidas", async () => {
    const spy = mockFetch({
      model: "test-model",
      choices: [{ message: { content: "ok" } }],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    await provedor.completarComFerramentas({
      modelo: "test-model",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    const corpo = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(corpo.tools).toBeDefined();
    expect(corpo.tools[0].type).toBe("function");
    expect(corpo.tools[0].function.name).toBe("read_file");
    expect(corpo.tool_choice).toBe("auto");
  });

  it("não envia tools quando ferramentas está vazia", async () => {
    const spy = mockFetch({
      model: "test-model",
      choices: [{ message: { content: "sem tools" } }],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    await provedor.completarComFerramentas({
      modelo: "test-model",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
    });

    const corpo = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(corpo.tools).toBeUndefined();
    expect(corpo.tool_choice).toBeUndefined();
  });

  it("serializa mensagem de ferramenta (role tool) corretamente", async () => {
    const spy = mockFetch({
      model: "test-model",
      choices: [{ message: { content: "pronto" } }],
    });

    const mensagens: MensagemChatAgente[] = [
      { papel: "system", conteudo: "Agente." },
      { papel: "user", conteudo: "Lê o arquivo" },
      {
        papel: "assistant",
        chamadas_ferramenta: [
          { id: "call_1", nome: "read_file", argumentos: { path: "index.ts" } },
        ],
      },
      {
        papel: "ferramenta",
        id_chamada: "call_1",
        nome: "read_file",
        conteudo: "export default {}",
      },
    ];

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    await provedor.completarComFerramentas({
      modelo: "test-model",
      mensagens,
      temperatura: 0,
    });

    const corpo = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const msgs = corpo.messages as Array<Record<string, unknown>>;

    // assistant com tool_calls
    const assistantMsg = msgs[2]!;
    expect(assistantMsg.role).toBe("assistant");
    expect(Array.isArray(assistantMsg.tool_calls)).toBe(true);
    const tc = (assistantMsg.tool_calls as Array<Record<string, unknown>>)[0]!;
    expect(tc.type).toBe("function");
    expect((tc.function as Record<string, string>).name).toBe("read_file");

    // resultado de ferramenta
    const toolMsg = msgs[3]!;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(toolMsg.content).toBe("export default {}");
  });
});

// ─── Parsing de respostas ────────────────────────────────────────────────────

describe("parsing de respostas agênticas", () => {
  it("retorna conteudo quando modelo responde com texto", async () => {
    mockFetch({
      model: "llama-3.1-8b",
      choices: [{ message: { content: "O arquivo contém X." } }],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completarComFerramentas({
      modelo: "llama-3.1-8b",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    expect(resultado.conteudo).toBe("O arquivo contém X.");
    expect(resultado.chamadas).toBeUndefined();
    expect(resultado.modelo).toBe("llama-3.1-8b");
    expect(typeof resultado.latencia_ms).toBe("number");
  });

  it("retorna chamadas quando modelo responde com tool_calls", async () => {
    mockFetch({
      model: "gpt-4o",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: JSON.stringify({ path: "src/index.ts" }),
                },
              },
            ],
          },
        },
      ],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completarComFerramentas({
      modelo: "gpt-4o",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    expect(resultado.conteudo).toBeUndefined();
    expect(resultado.chamadas).toHaveLength(1);
    expect(resultado.chamadas![0]!.id).toBe("call_abc");
    expect(resultado.chamadas![0]!.nome).toBe("read_file");
    expect(resultado.chamadas![0]!.argumentos).toEqual({ path: "src/index.ts" });
  });

  it("retorna múltiplas chamadas de ferramentas em paralelo", async () => {
    mockFetch({
      model: "gpt-4o",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: '{"path":"a.ts"}' },
              },
              {
                id: "call_2",
                type: "function",
                function: { name: "read_file", arguments: '{"path":"b.ts"}' },
              },
            ],
          },
        },
      ],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completarComFerramentas({
      modelo: "gpt-4o",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    expect(resultado.chamadas).toHaveLength(2);
    expect(resultado.chamadas![0]!.nome).toBe("read_file");
    expect(resultado.chamadas![1]!.argumentos).toEqual({ path: "b.ts" });
  });

  it("trata argumentos inválidos como objeto vazio — não quebra", async () => {
    mockFetch({
      model: "local-model",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_x",
                type: "function",
                function: {
                  name: "run_terminal_command",
                  arguments: "INVALIDO{{{",
                },
              },
            ],
          },
        },
      ],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completarComFerramentas({
      modelo: "local-model",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    expect(resultado.chamadas).toHaveLength(1);
    expect(resultado.chamadas![0]!.argumentos).toEqual({});
  });

  it("trata tool_calls com nome vazio — filtra a chamada", async () => {
    mockFetch({
      model: "local-model",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_y",
                type: "function",
                function: { name: "", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completarComFerramentas({
      modelo: "local-model",
      mensagens: MENSAGENS_BASE,
      temperatura: 0,
      ferramentas: [FERRAMENTA_LEITURA],
    });

    // chamadas filtradas → cai para conteudo vazio
    expect(resultado.chamadas).toBeUndefined();
    expect(resultado.conteudo).toBeDefined();
  });
});

// ─── ProvedorAgente satisfaz ProvedorLlm ────────────────────────────────────

describe("retrocompatibilidade", () => {
  it("completar() ainda funciona normalmente", async () => {
    mockFetch({
      model: "llama-3.1-8b",
      choices: [{ message: { content: "resposta simples" } }],
    });

    const provedor = criarProvedorOpenAi({
      apiKey: "test",
      baseUrl: "http://localhost:1234/v1",
    });

    const resultado = await provedor.completar({
      modelo: "llama-3.1-8b",
      mensagens: [
        { papel: "system", conteudo: "Você é a Luna." },
        { papel: "user", conteudo: "Oi" },
      ],
      temperatura: 0.7,
    });

    expect(resultado.conteudo).toBe("resposta simples");
  });
});
