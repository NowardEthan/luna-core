import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { modeloVisao } from "./descreverImagemOpenRouter.js";

/**
 * A escolha do modelo de visão por TIPO de mídia.
 *
 * O bug do painel do ônibus: um modelo "flash" barato inventava com confiança a placa
 * que não conseguia ler. Imagem passou a usar um modelo que tende a abster-se; vídeo
 * mantém o multimodal com suporte a `video_url`. Aqui travamos essa separação e a
 * ordem dos overrides de env, para ninguém regredir o padrão sem querer.
 */

const ENVS = [
  "OPENROUTER_VISION_MODEL",
  "OPENROUTER_VISION_MODEL_IMAGE",
  "OPENROUTER_VISION_MODEL_VIDEO",
] as const;

let backup: Record<string, string | undefined>;

beforeEach(() => {
  backup = Object.fromEntries(ENVS.map((k) => [k, process.env[k]]));
  for (const k of ENVS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENVS) {
    if (backup[k] === undefined) delete process.env[k];
    else process.env[k] = backup[k];
  }
});

describe("modeloVisao — modelo por tipo de mídia", () => {
  it("imagem e vídeo têm padrões diferentes (imagem não usa o flash de vídeo)", () => {
    const imagem = modeloVisao(false);
    const video = modeloVisao(true);
    expect(imagem).not.toBe(video);
    expect(video).toContain("qwen"); // vídeo mantém o multimodal com video_url
  });

  it("override específico do tipo tem prioridade", () => {
    process.env.OPENROUTER_VISION_MODEL_IMAGE = "modelo/imagem-forte";
    process.env.OPENROUTER_VISION_MODEL_VIDEO = "modelo/video-especial";
    expect(modeloVisao(false)).toBe("modelo/imagem-forte");
    expect(modeloVisao(true)).toBe("modelo/video-especial");
  });

  it("o global OPENROUTER_VISION_MODEL ainda vale para os dois (retrocompat)", () => {
    process.env.OPENROUTER_VISION_MODEL = "modelo/legado";
    expect(modeloVisao(false)).toBe("modelo/legado");
    expect(modeloVisao(true)).toBe("modelo/legado");
  });

  it("o específico do tipo vence o global", () => {
    process.env.OPENROUTER_VISION_MODEL = "modelo/legado";
    process.env.OPENROUTER_VISION_MODEL_IMAGE = "modelo/imagem-forte";
    expect(modeloVisao(false)).toBe("modelo/imagem-forte");
    expect(modeloVisao(true)).toBe("modelo/legado"); // vídeo sem específico cai no global
  });
});
