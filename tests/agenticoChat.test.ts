import { afterEach, describe, expect, it, vi } from "vitest";
import { responderComoLunaAgentico } from "../src/responder/responderComoLunaAgentico.js";
import type { ConfigLuna, ProvedorAgente } from "../src/providers/tipos.js";

const CONFIG: ConfigLuna = {
  apiKey: "test",
  baseUrl: "http://localhost:1234/v1",
  modeloMenor: "llama-3.1-8b-instant",
  modeloMaior: "gpt-oss-120b",
  temperaturaMenor: 0,
  temperaturaMaior: 0.7,
};

function provedorComLoopFerramenta(): ProvedorAgente {
  return {
    completar: vi.fn(),
    completarComFerramentas: vi
      .fn()
      .mockResolvedValueOnce({
        chamadas: [
          {
            id: "tool_1",
            nome: "ver_imagem",
            argumentos: { imagem_id: "img-1", pergunta: "o que aparece?" },
          },
        ],
        modelo: CONFIG.modeloMaior,
        latencia_ms: 8,
      })
      .mockResolvedValueOnce({
        conteudo: "Na imagem há um quadro com a frase Olá Luna.",
        modelo: CONFIG.modeloMaior,
        latencia_ms: 8,
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("responderComoLunaAgentico", () => {
  it("executa ver_imagem e retorna resposta final", async () => {
    const provedor = provedorComLoopFerramenta();
    const onAcao = vi.fn();

    const resposta = await responderComoLunaAgentico(
      "Descreve a imagem em anexo.",
      provedor,
      CONFIG,
      { briefing: "Contexto de teste", tokens_estimados: 12, cortes: [] },
      {
        anexosImagem: [
          {
            id: "img-1",
            nome: "captura.png",
            mimeType: "image/png",
            imageBase64: "a".repeat(120),
          },
        ],
        onAcao,
        visaoDeps: {
          descreverImagem: vi.fn().mockResolvedValue("Quadro branco com texto: Olá Luna."),
        },
      },
    );

    expect(resposta.texto).toContain("Na imagem");
    expect(onAcao).toHaveBeenCalledTimes(2);
    expect(onAcao).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tipo: "inicio_ferramenta", ferramenta: "ver_imagem" }),
    );
    expect(onAcao).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tipo: "fim_ferramenta", ferramenta: "ver_imagem", sucesso: true }),
    );
  });

  it("responde sem ferramenta quando modelo devolve texto direto", async () => {
    const provedor: ProvedorAgente = {
      completar: vi.fn(),
      completarComFerramentas: vi.fn().mockResolvedValue({
        conteudo: "Resposta direta sem análise visual.",
        modelo: CONFIG.modeloMaior,
        latencia_ms: 5,
      }),
    };

    const resposta = await responderComoLunaAgentico(
      "Oi",
      provedor,
      CONFIG,
      { briefing: "Contexto curto", tokens_estimados: 4, cortes: [] },
      { anexosImagem: [] },
    );

    expect(resposta.texto).toContain("Resposta direta");
  });
});
