import { describe, expect, it } from "vitest";

import { obterDb } from "../src/memoria/longa/storeSqlite.js";
import { executarSono } from "../src/mundo/sono/consolidador.js";
import {
  listarEventosVida,
  listarResumosVidaSemanais,
  registrarEventoVida,
  resetarVidaParaTeste,
} from "../src/mundo/vida/storeVida.js";

describe("sono + vida", () => {
  it("compacta eventos antigos em resumo semanal", async () => {
    resetarVidaParaTeste();
    obterDb().prepare(`DELETE FROM sono_controle WHERE id = 'luna'`).run();

    const e1 = registrarEventoVida({
      tipo: "foco",
      narrativa: "Sequência intensa de execução no projeto.",
      intensidade: 0.7,
      origem: "analise",
    });
    const e2 = registrarEventoVida({
      tipo: "insight",
      narrativa: "Insight sobre simplificação do pipeline.",
      intensidade: 0.6,
      origem: "mensagem",
    });

    const antigo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    obterDb()
      .prepare(`UPDATE vida_eventos SET criado_em = ? WHERE id IN (?, ?)`)
      .run(antigo, e1.id, e2.id);

    const resultado = await executarSono();
    expect(resultado.consolidou).toBe(true);

    const resumos = listarResumosVidaSemanais(5);
    expect(resumos.length).toBeGreaterThan(0);
    expect(resumos[0]?.eventos).toContain(e1.id);
    expect(resumos[0]?.eventos).toContain(e2.id);
    expect(listarEventosVida(10).map((item) => item.id)).not.toContain(e1.id);
  });
});
