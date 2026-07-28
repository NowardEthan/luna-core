import { afterEach, describe, expect, it } from "vitest";

import { medidaDeContagens, medidorFomeAtivo } from "./medirFome.js";

/**
 * Um medidor errado é PIOR que nenhum — daria uma leitura falsa e a gente consertaria o
 * lugar errado. Estes testes travam a regra: fome = as TRÊS fontes próprias zeradas.
 */
describe("medidor de fome (C1) — mede antes de consertar", () => {
  it("despensa vazia (0/0/0) → faminto, mesmo com fio em aberto", () => {
    const m = medidaDeContagens(0, 0, 0, true);
    expect(m.faminto).toBe(true);
    expect(m.total).toBe(0);
    // o fio é material, mas derivado da conversa (pode ser o assunto DELE) — não tira a fome
    expect(m.temFio).toBe(true);
  });

  it("qualquer fonte própria > 0 → NÃO faminto", () => {
    expect(medidaDeContagens(1, 0, 0, false).faminto).toBe(false);
    expect(medidaDeContagens(0, 1, 0, false).faminto).toBe(false);
    expect(medidaDeContagens(0, 0, 1, false).faminto).toBe(false);
  });

  it("soma as três fontes próprias em total", () => {
    const m = medidaDeContagens(3, 4, 3, false);
    expect(m.total).toBe(10);
    expect(m.faminto).toBe(false);
  });

  describe("gate por env — off por padrão, não emite nada em produção", () => {
    afterEach(() => {
      delete process.env.LUNA_MEDIR_FOME;
    });

    it("desligado quando a env não está setada", () => {
      delete process.env.LUNA_MEDIR_FOME;
      expect(medidorFomeAtivo()).toBe(false);
    });

    it("liga com 1 / true / on", () => {
      for (const v of ["1", "true", "on", "TRUE", "On"]) {
        process.env.LUNA_MEDIR_FOME = v;
        expect(medidorFomeAtivo()).toBe(true);
      }
    });

    it("continua desligado com qualquer outro valor", () => {
      process.env.LUNA_MEDIR_FOME = "0";
      expect(medidorFomeAtivo()).toBe(false);
      process.env.LUNA_MEDIR_FOME = "off";
      expect(medidorFomeAtivo()).toBe(false);
    });
  });
});
