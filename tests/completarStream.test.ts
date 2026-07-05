import { describe, expect, it } from "vitest";

import { processarLinhasSse } from "../src/providers/completarStream.js";

describe("processarLinhasSse", () => {
  it("emite chunks de reasoning e content", () => {
    const chunks: Array<{ tipo: string; delta: string }> = [];
    processarLinhasSse(
      [
        'data: {"choices":[{"delta":{"reasoning":"Pensando"}}]}',
        'data: {"choices":[{"delta":{"content":"Olá"}}]}',
        "data: [DONE]",
      ],
      (c) => chunks.push(c),
    );
    expect(chunks).toEqual([
      { tipo: "reasoning", delta: "Pensando" },
      { tipo: "content", delta: "Olá" },
    ]);
  });

  it("ignora linhas inválidas e [DONE]", () => {
    const chunks: Array<{ tipo: string; delta: string }> = [];
    processarLinhasSse(["data: not-json", "data: [DONE]", ""], (c) => chunks.push(c));
    expect(chunks).toHaveLength(0);
  });
});
