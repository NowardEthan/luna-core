import { describe, expect, it } from "vitest";
import { visaoGemma } from "./visaoGemma.js";

describe("visaoGemma", () => {
  it("devolve falha explícita quando o modelo de visão não está disponível", async () => {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    let resposta = "";
    try {
      resposta = await visaoGemma(
        {
          imagens: [
            {
              id: "video-tv",
              nome: "Assistindo kk",
              mimeType: "video/mp4",
              url: "https://storage.example/video.mp4",
            },
          ],
          pergunta: "o que estão assistindo?",
        },
      );
    } finally {
      if (openRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = openRouterKey;
    }

    expect(resposta).toContain("VISUAL_ANALYSIS_FAILED");
    expect(resposta).toContain("não consegui analisar Assistindo kk");
    expect(resposta).toContain("NÃO tente adivinhar");
  });

  it("marca exceção do provedor como falha visual, não como descrição", async () => {
    const resposta = await visaoGemma(
      {
        imagens: [
          {
            id: "foto",
            nome: "print",
            mimeType: "image/jpeg",
            url: "https://storage.example/print.jpg",
          },
        ],
      },
      {
        descreverImagem: async () => {
          throw new Error("limite técnico");
        },
      },
    );

    expect(resposta).toContain("VISUAL_ANALYSIS_FAILED");
    expect(resposta).toContain("limite técnico");
    expect(resposta).toContain("NÃO adivinhe");
  });
});
