import { afterEach, describe, expect, it, vi } from "vitest";

import { criarProvedorOpenAi } from "../src/providers/openaiCompativel.js";

/**
 * A2 (Latência com Alma): confiabilidade.
 *
 * A conversa real morreu em falhas de REDE ("Unable to resolve host", timeout) —
 * e caiu justo no "te amo". Uma completação é sem efeito colateral, então retentar
 * é seguro. Estes testes travam: falha transitória de rede → tenta de novo e responde.
 */
function respostaOk(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ model: "m", choices: [{ message: { content } }] }),
    text: async () => "",
  } as unknown as Response;
}

describe("openaiCompativel — A2: retry em rede/timeout", () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it("recupera de uma falha de rede (DNS) e responde na 2ª tentativa", async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed: Unable to resolve host");
      return respostaOk("oi, tô aqui");
    }) as unknown as typeof fetch;

    const prov = criarProvedorOpenAi({
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      maxTentativas: 2,
    });

    const r = await prov.completar({
      modelo: "deepseek/deepseek-v4-pro",
      mensagens: [{ papel: "user", conteudo: "te amo" }],
      temperatura: 0.5,
    });

    expect(r.conteudo).toBe("oi, tô aqui");
    expect(n).toBe(2); // tentou de novo, não morreu de primeira
  });

  it("desiste com erro claro (sem CEREBRAS_API_KEY) após esgotar as tentativas", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed: ECONNRESET");
    }) as unknown as typeof fetch;

    const prov = criarProvedorOpenAi({
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      maxTentativas: 2,
    });

    await expect(
      prov.completar({
        modelo: "deepseek/deepseek-v4-pro",
        mensagens: [{ papel: "user", conteudo: "oi" }],
        temperatura: 0.5,
      }),
    ).rejects.toThrow(/rede\/timeout/i);
  });
});
