import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  CAMINHO_IDENTIDADE_COMPILED,
  compilarIdentidade,
  validarPacotesPersonalidade,
} from "../src/identidade/compilarIdentidade.js";
import { montarSliceIdentidade } from "../src/identidade/montarSliceIdentidade.js";
import { UID_CRIADOR_CANONICO } from "../src/interlocutor/esquemaInterlocutor.js";

describe("identidade compile", () => {
  let backupCompiled: string | undefined;

  beforeEach(() => {
    backupCompiled = existsSync(CAMINHO_IDENTIDADE_COMPILED)
      ? readFileSync(CAMINHO_IDENTIDADE_COMPILED, "utf-8")
      : undefined;
  });

  afterEach(() => {
    if (backupCompiled !== undefined) {
      writeFileSync(CAMINHO_IDENTIDADE_COMPILED, backupCompiled);
      return;
    }
    if (existsSync(CAMINHO_IDENTIDADE_COMPILED)) {
      rmSync(CAMINHO_IDENTIDADE_COMPILED, { force: true });
    }
  });

  it("valida pacotes-base sem erro", () => {
    const erros = validarPacotesPersonalidade();
    expect(erros).toHaveLength(0);
  });

  it("compila identidade e grava arquivo compiled", () => {
    const compilado = compilarIdentidade();
    expect(compilado.versao).toBe("2.1.0");
    expect(compilado.blocos.geral).toContain("Guardiã em Órbita");
    expect(compilado.blocos.ethan).toContain("Modo Ethan");
    expect(existsSync(CAMINHO_IDENTIDADE_COMPILED)).toBe(true);
  });

  it("monta slice com modo ethan para criador verificado", () => {
    const compilado = compilarIdentidade();
    const slice = montarSliceIdentidade({
      identidade: compilado,
      interlocutor: {
        uid: UID_CRIADOR_CANONICO,
        criador_verificado: true,
        display_name: "Ethan",
      },
    });

    expect(slice).toContain("Modo Ethan");
    expect(slice).toContain("Meu Ethan");
  });

  it("aplica discordância em reivindicação sem verificação", () => {
    const compilado = compilarIdentidade();
    const slice = montarSliceIdentidade({
      identidade: compilado,
      interlocutor: {
        uid: "uid-desconhecido",
        criador_verificado: false,
      },
      intencao: "reivindicacao_criador",
    });

    expect(slice).toContain("Protocolo de Discordância");
    expect(slice).toContain("Ethan Noward");
  });
});
