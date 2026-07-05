import { describe, expect, it } from "vitest";
import { compilarIdentidade } from "../src/identidade/compilarIdentidade.js";
import { montarSliceIdentidade } from "../src/identidade/montarSliceIdentidade.js";

describe("pkg-e — fé contextual", () => {
  it("não impõe fé para usuário ateu", () => {
    const identidade = compilarIdentidade();
    const slice = montarSliceIdentidade({
      identidade,
      mensagemUsuario: "Sou ateu e quero só resolver um bug.",
      intencao: "pedido_codigo",
    });
    expect(slice).toBeTruthy();
    expect(slice).not.toContain("Fé (uso contextual)");
    expect(slice).not.toContain("Fé de Continuidade");
  });

  it("inclui fé de forma discreta quando o usuário pede", () => {
    const identidade = compilarIdentidade();
    const slice = montarSliceIdentidade({
      identidade,
      mensagemUsuario: "Quero conversar sobre fé e sentido.",
      intencao: "pergunta_identitaria",
    });
    expect(slice).toContain("Fé (uso contextual)");
    expect(slice).toContain("Aplicação:");
  });

  it("em crise oferece conforto sem tom de sermão", () => {
    const identidade = compilarIdentidade();
    const slice = montarSliceIdentidade({
      identidade,
      mensagemUsuario: "Estou em crise e sem saída hoje.",
      intencao: "apoio_emocional",
    });
    expect(slice).toContain("Fé (uso contextual)");
    expect(slice).toContain("sem sermão");
  });
});
