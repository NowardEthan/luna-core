import { afterEach, describe, expect, it } from "vitest";

import {
  isCerebrasChatPrimary,
  isOpenrouterChatPrimary,
  normalizeLegacyProviderSelection,
  REDUCED_LLM_SELECTION,
  resolveLlmConfig,
  resolveLlmProviderSelection,
} from "../mobile-api/src/llmProviders.js";

/**
 * A0 (Latência com Alma): o chat fala com UM provedor — OpenRouter.
 *
 * O mundo antigo (Groq pro free, Cerebras pro premium, fallbacks cruzados) era a
 * origem das quedas na conversa real («verifica CEREBRAS_API_KEY no Railway» no
 * meio de um «te amo»). Estes testes travam o mundo novo: seja qual for o pedido
 * (groq/cerebras/auto/legado) e o plano, a config que sai é OpenRouter.
 */
describe("roteamento LLM mobile-api — A0: só OpenRouter", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("pedido legado de groq resolve para OpenRouter", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";

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

    const config = resolveLlmConfig(resolved!.selection);
    expect(config?.baseUrl).toContain("openrouter.ai");
    expect(config?.apiKey).toBe("sk-or-test");
  });

  it("pedido legado de cerebras resolve para OpenRouter (mesmo com CEREBRAS_API_KEY no ambiente)", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.CEREBRAS_API_KEY = "csk-fantasma"; // sobra no Railway não pode reativar o caminho

    expect(isCerebrasChatPrimary()).toBe(false);
    expect(isOpenrouterChatPrimary()).toBe(true);

    const normalized = normalizeLegacyProviderSelection(
      { providerId: "cerebras", modelKey: "glm-47" },
      "pro",
    );
    expect(normalized).toEqual({ providerId: "openrouter", modelKey: "default" });

    const config = resolveLlmConfig({ providerId: "cerebras", modelKey: "glm-47" });
    expect(config?.baseUrl).toContain("openrouter.ai");
    expect(config?.apiKey).toBe("sk-or-test");
  });

  it("auto resolve para OpenRouter (o roteador escolhe modelo, nunca outro provedor)", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.LUNA_API_KEY = "gsk-so-para-stt";

    const resolved = resolveLlmProviderSelection(
      { providerId: "auto", modelKey: "auto" },
      "explica esse código\nfunction foo() {}",
      "pro",
    );
    expect(resolved?.selection.providerId).toBe("openrouter");
  });

  it("plano free TAMBÉM usa OpenRouter — só que no modelo leve (não no Pro)", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.LUNA_API_KEY = "gsk-so-para-stt";
    delete process.env.OPENROUTER_MODEL_FREE;
    delete process.env.OPENROUTER_MODELO_MENOR;

    const resolved = resolveLlmProviderSelection(
      { providerId: "openrouter", modelKey: "default" },
      "oi",
      "free",
    );
    expect(resolved?.selection.providerId).toBe("openrouter");

    const configFree = resolveLlmConfig(resolved!.selection, "free");
    const configPro = resolveLlmConfig(resolved!.selection, "pro");
    expect(configFree?.baseUrl).toContain("openrouter.ai");
    // Free responde no modelo leve; pago responde no Pro.
    expect(configFree?.modeloMaior).toBe(configFree?.modeloMenor);
    expect(configPro?.modeloMaior).not.toBe(configPro?.modeloMenor);
  });

  it("modo reduzido (quota) fica no OpenRouter — nunca mais Cerebras", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";

    expect(REDUCED_LLM_SELECTION.providerId).toBe("openrouter");
    const config = resolveLlmConfig(REDUCED_LLM_SELECTION);
    expect(config?.baseUrl).toContain("openrouter.ai");
  });

  it("sem OPENROUTER_API_KEY não há chat — nada de cair calado em outro provedor", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.CEREBRAS_API_KEY = "csk-fantasma";
    process.env.LUNA_API_KEY = "gsk-fantasma";

    const config = resolveLlmConfig({ providerId: "openrouter", modelKey: "default" });
    expect(config).toBeNull();
  });
});
