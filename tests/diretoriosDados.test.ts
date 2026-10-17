import { afterAll, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { configurarDiretoriosDados, obterDiretoriosDados } from "../src/config/diretoriosDados.js";
import { criarSessao } from "../src/memoria/gerenciadorSessao.js";
import { caminhoSessao, salvarSessao } from "../src/memoria/storeSessao.js";
import { salvarFila } from "../src/presenca/storePresenca.js";

const raiz = join(tmpdir(), `luna-core-diretorios-${process.pid}-${Date.now()}`);

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("configuração central de diretórios", () => {
  it("direciona sessões e presença antes do primeiro uso", () => {
    const diretorios = configurarDiretoriosDados({ raiz });
    const sessao = criarSessao();

    salvarSessao(sessao);
    salvarFila([]);

    expect(obterDiretoriosDados()).toEqual(diretorios);
    expect(caminhoSessao(sessao.id)).toBe(join(raiz, "sessoes", `${sessao.id}.json`));
    expect(existsSync(caminhoSessao(sessao.id))).toBe(true);
    expect(existsSync(join(raiz, "presenca", "fila.json"))).toBe(true);
    expect(diretorios.sqlite).toBe(join(raiz, "memoria.db"));
    expect(diretorios.modelos).toBe(join(raiz, "modelos"));
    expect(diretorios.logs).toBe(join(raiz, "interacoes"));
  });

  it("impede reconfiguração depois do primeiro uso", () => {
    expect(() => configurarDiretoriosDados({ raiz: join(raiz, "outra") })).toThrow(
      /antes da primeira execução/i,
    );
  });
});
