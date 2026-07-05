import { describe, expect, it } from "vitest";

import { validarAtlas } from "../src/atlas/compilarAtlas.js";
import { inferirAtlas } from "../src/atlas/inferirAtlas.js";

describe("Atlas Lunar", () => {
  it("valida os 22 registros seed", async () => {
    const { registros } = await validarAtlas();
    expect(registros).toHaveLength(22);
  });

  it('inferirAtlas("como mando foto") inclui como-mandar-foto', async () => {
    const resultados = await inferirAtlas("como mando foto");
    expect(resultados.some((item) => item.id === "como-mandar-foto")).toBe(true);
  });
});
