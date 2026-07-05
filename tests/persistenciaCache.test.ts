import { describe, expect, it } from "vitest";
import { salvarClimaGlobal, lerClimaGlobal } from "../src/mundo/humor/climaHumor.js";
import { salvarRelacaoHumor, lerRelacaoHumor } from "../src/mundo/humor/relacaoHumor.js";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
} from "../src/persistencia/contextoMundo.js";
import { docMundoGlobal, docHumorRelacao } from "../src/persistencia/caminhosFirestore.js";

describe("persistencia — cache por request", () => {
  it("humor clima e relação usam cache sem SQLite", async () => {
    const cache = criarCacheMundoVazio("uid-teste");

    await executarComCacheMundo(cache, async () => {
      salvarClimaGlobal({ valencia: 0.5, energia: 0.6, atualizado_em: new Date().toISOString() });
      salvarRelacaoHumor({
        interlocutor_id: "uid-teste",
        proximidade: 0.7,
        disposicao: "aberta",
        ultimo_impacto: null,
        intensidade: 0,
        turnos_desde: 0,
        atualizado_em: new Date().toISOString(),
      });

      const clima = lerClimaGlobal();
      const relacao = lerRelacaoHumor("uid-teste");
      expect(clima.valencia).toBeCloseTo(0.5, 2);
      expect(relacao.proximidade).toBe(0.7);
    });

    expect(cache.dirty.clima).toBe(true);
    expect(cache.dirty.relacao).toBe(true);
  });

  it("caminhos Firestore seguem convenção", () => {
    expect(docMundoGlobal("clima")).toBe("luna_mundo/clima");
    expect(docHumorRelacao("abc123")).toBe("users/abc123/luna/humor_relacao");
  });
});
