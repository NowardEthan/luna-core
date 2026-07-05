import { describe, expect, it, afterEach } from "vitest";

import {
  isCerebrasBaseUrl,
  serializarCorpoLlm,
} from "../src/providers/cerebrasPayload.js";

describe("serializarCorpoLlm", () => {
  const prev = process.env.CEREBRAS_GZIP_MIN_BYTES;

  afterEach(() => {
    if (prev === undefined) delete process.env.CEREBRAS_GZIP_MIN_BYTES;
    else process.env.CEREBRAS_GZIP_MIN_BYTES = prev;
  });

  it("detecta base URL Cerebras", () => {
    expect(isCerebrasBaseUrl("https://api.cerebras.ai/v1")).toBe(true);
    expect(isCerebrasBaseUrl("https://api.groq.com/openai/v1")).toBe(false);
  });

  it("não comprime payloads pequenos", () => {
    process.env.CEREBRAS_GZIP_MIN_BYTES = "8192";
    const corpo = { model: "zai-glm-4.7", messages: [{ role: "user", content: "oi" }] };
    const { body, headers } = serializarCorpoLlm(corpo, "https://api.cerebras.ai/v1");
    expect(typeof body).toBe("string");
    expect(headers["Content-Encoding"]).toBeUndefined();
  });

  it("comprime payloads grandes para Cerebras", () => {
    process.env.CEREBRAS_GZIP_MIN_BYTES = "64";
    const corpo = {
      model: "zai-glm-4.7",
      messages: [{ role: "user", content: "x".repeat(200) }],
    };
    const { body, headers } = serializarCorpoLlm(corpo, "https://api.cerebras.ai/v1");
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(headers["Content-Encoding"]).toBe("gzip");
  });

  it("não comprime para outros providers mesmo com payload grande", () => {
    process.env.CEREBRAS_GZIP_MIN_BYTES = "64";
    const corpo = {
      model: "llama",
      messages: [{ role: "user", content: "x".repeat(200) }],
    };
    const { body, headers } = serializarCorpoLlm(corpo, "https://api.groq.com/openai/v1");
    expect(typeof body).toBe("string");
    expect(headers["Content-Encoding"]).toBeUndefined();
  });
});
