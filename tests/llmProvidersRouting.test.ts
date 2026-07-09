import { afterEach, describe, expect, it } from "vitest";

import {
  isCerebrasChatPrimary,
  isOpenrouterChatPrimary,
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

  it("premium + OPENROUTER_API_KEY força DeepSeek mesmo com pedido groq/cerebras", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.CEREBRAS_API_KEY = "csk-test";
    delete process.env.LUNA_GROQ_CHAT;

    expect(isOpenrouterChatPrimary()).toBe(true);
    expect(isCerebrasChatPrimary()).toBe(false);

    const normalized = normalizeLegacyProviderSelection(
      { providerId: "groq", modelKey: "default" },
      "pro",
    );
    expect(normalized).toEqual({ providerId: "openrouter", modelKey: "default" });

    const resolved = resolveLlmProviderSelection(
      { providerId: "groq", modelKey: "default" },
      "oi",
      "pro",
    );
    expect(resolved?.selection.providerId).toBe("openrouter");

    // Mesmo um pedido explícito de Cerebras cai no OpenRouter via rede de segurança do resolveLlmConfig.
    const configFromExplicitCerebras = resolveLlmConfig({ providerId: "cerebras", modelKey: "glm-47" });
    expect(configFromExplicitCerebras?.baseUrl).toContain("openrouter.ai");

    const config = resolveLlmConfig(resolved!.selection);
    expect(config?.baseUrl).toContain("openrouter.ai");
    expect(config?.apiKey).toBe("sk-or-test");
    expect(config?.modeloMaior).toBe("deepseek/deepseek-v3.2");
  });

  it("plano free não recebe DeepSeek/OpenRouter mesmo com OPENROUTER_API_KEY configurada", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.LUNA_API_KEY = "gsk-test";

    const resolved = resolveLlmProviderSelection(
      { providerId: "openrouter", modelKey: "default" },
      "oi",
      "free",
    );
    expect(resolved?.selection).toEqual({ providerId: "groq", modelKey: "default" });
  });
});
