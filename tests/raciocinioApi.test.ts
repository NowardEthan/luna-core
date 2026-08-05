import { describe, expect, it } from "vitest";

import {
  aplicarCorpoRaciocinio,
  blocoPromptIdiomaRaciocinio,
  modeloSuportaRaciocinioExplicito,
  precisaRaciocinioPorPrompt,
} from "../src/providers/raciocinioApi.js";

describe("modeloSuportaRaciocinioExplicito OpenRouter Qwen", () => {
  const or = "https://openrouter.ai/api/v1";

  it("reconhece qwen3.6-plus como reasoning nativo", () => {
    expect(modeloSuportaRaciocinioExplicito("qwen/qwen3.6-plus", or)).toBe(true);
    expect(precisaRaciocinioPorPrompt("qwen/qwen3.6-plus", or, true)).toBe(false);
  });

  it("pede idioma pt-BR no bloco de pensamento", () => {
    const bloco = blocoPromptIdiomaRaciocinio();
    expect(bloco).toMatch(/português do Brasil/i);
    expect(bloco).toMatch(/nunca em inglês/i);
  });

  it("aplica reasoning effort no corpo OpenRouter", () => {
    const corpo: Record<string, unknown> = {};
    aplicarCorpoRaciocinio(corpo, "qwen/qwen3.6-plus", or, true, true, "medium");
    expect(corpo.reasoning).toEqual({ effort: "medium" });
  });
});

describe("aplicarCorpoRaciocinio Groq gpt-oss", () => {
  it("usa só reasoning_format (não include_reasoning)", () => {
    const corpo: Record<string, unknown> = {};
    aplicarCorpoRaciocinio(
      corpo,
      "openai/gpt-oss-120b",
      "https://api.groq.com/openai/v1",
      true,
      false,
    );
    expect(corpo.reasoning_format).toBe("parsed");
    expect(corpo.include_reasoning).toBeUndefined();
  });

  it("oculta raciocínio quando inactivo", () => {
    const corpo: Record<string, unknown> = {};
    aplicarCorpoRaciocinio(
      corpo,
      "openai/gpt-oss-120b",
      "https://api.groq.com/openai/v1",
      false,
      false,
    );
    expect(corpo.reasoning_format).toBe("hidden");
    expect(corpo.include_reasoning).toBeUndefined();
  });
});

describe("aplicarCorpoRaciocinio Cerebras zai-glm-4.7", () => {
  it("usa reasoning_format parsed e reasoning_effort medium quando activo", () => {
    const corpo: Record<string, unknown> = {};
    aplicarCorpoRaciocinio(
      corpo,
      "zai-glm-4.7",
      "https://api.cerebras.ai/v1",
      true,
      false,
    );
    expect(corpo.reasoning_format).toBe("parsed");
    expect(corpo.reasoning_effort).toBe("medium");
  });

  it("desactiva raciocínio com reasoning_effort none", () => {
    const corpo: Record<string, unknown> = {};
    aplicarCorpoRaciocinio(
      corpo,
      "zai-glm-4.7",
      "https://api.cerebras.ai/v1",
      false,
      false,
    );
    expect(corpo.reasoning_effort).toBe("none");
    expect(corpo.reasoning_format).toBe("hidden");
  });
});
