import { afterEach, describe, expect, it } from "vitest";

import {
  isCerebrasChatPrimary,
  normalizeLegacyProviderSelection,
  resolveLlmConfig,
  resolveLlmProviderSelection,
} from "../mobile-api/src/llmProviders.js";

describe("roteamento LLM mobile-api", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("premium + CEREBRAS_API_KEY força GLM mesmo com pedido groq", () => {
    process.env.CEREBRAS_API_KEY = "csk-test";
    delete process.env.LUNA_GROQ_CHAT;

    const normalized = normalizeLegacyProviderSelection(
      { providerId: "groq", modelKey: "default" },
      "pro",
    );
    expect(normalized).toEqual({ providerId: "cerebras", modelKey: "glm-47" });

    const resolved = resolveLlmProviderSelection(
      { providerId: "groq", modelKey: "default" },
      "oi",
      "pro",
    );
    expect(resolved?.selection).toEqual({ providerId: "cerebras", modelKey: "glm-47" });

    const config = resolveLlmConfig(resolved!.selection);
    expect(config?.baseUrl).toContain("cerebras.ai");
    expect(config?.apiKey).toBe("csk-test");
  });

  it("plano free continua no Groq quando Cerebras está configurado", () => {
    process.env.CEREBRAS_API_KEY = "csk-test";
    process.env.LUNA_API_KEY = "gsk-test";

    const resolved = resolveLlmProviderSelection(
      { providerId: "groq", modelKey: "default" },
      "oi",
      "free",
    );
    expect(resolved?.selection).toEqual({ providerId: "groq", modelKey: "default" });
  });

  it("isCerebrasChatPrimary é true com Cerebras e sem LUNA_GROQ_CHAT", () => {
    process.env.CEREBRAS_API_KEY = "csk-test";
    delete process.env.LUNA_GROQ_CHAT;
    expect(isCerebrasChatPrimary()).toBe(true);
  });

  it("auto no premium resolve para cerebras/glm-47", () => {
    process.env.CEREBRAS_API_KEY = "csk-test";
    process.env.LUNA_API_KEY = "gsk-test";

    const resolved = resolveLlmProviderSelection(
      { providerId: "auto", modelKey: "auto" },
      "explica esse código\nfunction foo() {}",
      "pro",
    );
    expect(resolved?.selection).toEqual({ providerId: "cerebras", modelKey: "glm-47" });
  });
});
