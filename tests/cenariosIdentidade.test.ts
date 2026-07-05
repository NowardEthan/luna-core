import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validarFormaMd } from "../src/validacao/validadorFormaMd.js";
import { validarInterlocutor } from "../src/validacao/validadorInterlocutor.js";
import { validarTom } from "../src/validacao/validadorTom.js";

type CenarioIdentidade = {
  id: string;
  nome: string;
  resposta: string;
  criador_verificado: boolean;
  esperado: {
    tom_ok: boolean;
    interlocutor_ok: boolean;
    forma_md_ok: boolean;
  };
};

function carregarCenarios(): CenarioIdentidade[] {
  const caminho = join(process.cwd(), "tests", "cenarios-identidade.json");
  const parsed = JSON.parse(readFileSync(caminho, "utf-8")) as { cenarios: CenarioIdentidade[] };
  return parsed.cenarios;
}

describe("pkg-d — cenários de identidade", () => {
  it("tem pelo menos 25 cenários", () => {
    expect(carregarCenarios().length).toBeGreaterThanOrEqual(25);
  });

  it("executa cenário a cenário com mocks de interlocutor", () => {
    const cenarios = carregarCenarios();
    const falhas: string[] = [];

    for (const cenario of cenarios) {
      const tom = validarTom(cenario.resposta);
      const interlocutor = validarInterlocutor(cenario.resposta, {
        criador_verificado: cenario.criador_verificado,
      });
      const formaMd = validarFormaMd(cenario.resposta);

      if (tom.aprovado !== cenario.esperado.tom_ok) {
        falhas.push(
          `${cenario.id}: tom esperado=${cenario.esperado.tom_ok} obtido=${tom.aprovado}`,
        );
      }
      if (interlocutor.aprovado !== cenario.esperado.interlocutor_ok) {
        falhas.push(
          `${cenario.id}: interlocutor esperado=${cenario.esperado.interlocutor_ok} obtido=${interlocutor.aprovado}`,
        );
      }
      if (formaMd.aprovado !== cenario.esperado.forma_md_ok) {
        falhas.push(
          `${cenario.id}: forma_md esperado=${cenario.esperado.forma_md_ok} obtido=${formaMd.aprovado}`,
        );
      }
    }

    expect(falhas).toEqual([]);
  });
});
