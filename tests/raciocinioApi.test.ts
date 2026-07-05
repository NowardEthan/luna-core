import { describe, expect, it } from "vitest";

import { aplicarCorpoRaciocinio } from "../src/providers/raciocinioApi.js";

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
