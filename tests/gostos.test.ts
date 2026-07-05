import { describe, expect, it } from "vitest";
import { refletirGostosLuna } from "../src/mundo/gostos/refletorGostosLuna.js";
import {
  listarGostosLuna,
  registrarGostoLuna,
  resetarGostosParaTeste,
} from "../src/mundo/gostos/storeGostos.js";

describe("pkg-g — gostos", () => {
  it("acumula afinidade por tópico e reflete no resumo", () => {
    resetarGostosParaTeste();
    registrarGostoLuna("arquitetura", 0.8, "preferência explícita");
    registrarGostoLuna("arquitetura", 0.6, "preferência recorrente");
    const gostos = listarGostosLuna(3);
    expect(gostos).toHaveLength(1);
    expect(gostos[0].afinidade).toBeGreaterThan(0.6);
    const resumo = refletirGostosLuna();
    expect(resumo).toContain("arquitetura");
  });
});
