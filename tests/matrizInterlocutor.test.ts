import { describe, expect, it } from "vitest";
import { UID_CRIADOR_CANONICO } from "../src/interlocutor/esquemaInterlocutor.js";
import {
  ehInterlocutorEthan,
  montarMatrizInterlocutor,
} from "../src/interlocutor/matrizInterlocutor.js";
import { sanitizarInterlocutorPipeline } from "../src/interlocutor/validadorInterlocutor.js";

describe("matrizInterlocutor", () => {
  it("classifica Ethan com UID canónico", () => {
    expect(
      ehInterlocutorEthan({
        uid: UID_CRIADOR_CANONICO,
        criador_verificado: false,
      }),
    ).toBe(true);
  });

  it("aplica regras gerais para interlocutor não verificado", () => {
    const matriz = montarMatrizInterlocutor({
      uid: "uid-aleatorio",
      criador_verificado: false,
      display_name: "Pessoa",
    });

    expect(matriz.perfil).toBe("geral");
    expect(matriz.habilitar_modo_ethan).toBe(false);
    expect(matriz.aplicar_anti_reivindicacao).toBe(true);
  });

  it("validador ignora criador_verificado vindo do cliente", () => {
    const validado = sanitizarInterlocutorPipeline({
      uid: "uid-aleatorio",
      criador_verificado: true,
      display_name: "  Nome  ",
    });

    expect(validado).toEqual({
      uid: "uid-aleatorio",
      criador_verificado: false,
      display_name: "Nome",
    });
  });
});
