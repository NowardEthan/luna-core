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
