import { describe, expect, it } from "vitest";
import type { IntencaoLuna, TipoIntencaoLuna } from "./esquemaIntencao.js";
import { formatarBlocoIntencao } from "./formatarIntencao.js";

function intencao(over: Partial<IntencaoLuna> & { tipo: TipoIntencaoLuna }): IntencaoLuna {
  return {
    foco: "",
    impulso: 0.5,
    recuar: false,
    motivo: "",
    fonte: "regras",
    ...over,
  };
}

describe("formatarBlocoIntencao — anti-confabulação", () => {
  it("retomar_fio SEM foco não manda puxar um fio inexistente — ancora no agora", () => {
    const bloco = formatarBlocoIntencao(intencao({ tipo: "retomar_fio", foco: "" }));
    // O antigo "puxe um fio que ficou em aberto entre vocês" era a licença pra inventar.
    expect(bloco).not.toMatch(/fio que ficou em aberto entre vocês/i);
    expect(bloco).toMatch(/no agora/i);
  });

  it("partilhar SEM foco não manda 'dividir o mundo interior' no vazio — ancora no agora", () => {
    const bloco = formatarBlocoIntencao(intencao({ tipo: "partilhar", foco: "" }));
    expect(bloco).not.toMatch(/mundo interior/i);
    expect(bloco).toMatch(/no agora/i);
  });

  it("retomar_fio COM foco real segue puxando aquele fio nomeado", () => {
    const bloco = formatarBlocoIntencao(
      intencao({ tipo: "retomar_fio", foco: "a aula de desenho de vocês" }),
    );
    expect(bloco).toMatch(/a aula de desenho de vocês/);
  });

  it("movimentos que tocam o passado levam a guarda dura de não inventar", () => {
    for (const tipo of ["retomar_fio", "partilhar", "provocar"] as const) {
      const bloco = formatarBlocoIntencao(intencao({ tipo, foco: "algo" }));
      expect(bloco, tipo).toMatch(/Nunca invente passado/i);
    }
  });

  it("movimentos ancorados no presente NÃO carregam a guarda (não precisam)", () => {
    for (const tipo of ["cuidar", "aprofundar", "so_presenca"] as const) {
      const bloco = formatarBlocoIntencao(intencao({ tipo, foco: "algo" }));
      expect(bloco, tipo).not.toMatch(/Nunca invente passado/i);
    }
  });

  it("em recuo, não emite a guarda nem a diretiva de iniciativa", () => {
    const bloco = formatarBlocoIntencao(
      intencao({ tipo: "retomar_fio", foco: "algo", recuar: true }),
    );
    expect(bloco).not.toMatch(/Nunca invente passado/i);
    expect(bloco).toMatch(/recue da sua agenda/i);
  });
});
