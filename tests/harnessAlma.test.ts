import { describe, expect, it } from "vitest";

import { classificarProfundidade } from "../src/estado/talamoPipeline.js";
import { classificarPesoTurno } from "../src/estado/pesoTurno.js";
import { perguntaPedePrecisao } from "../src/agentico/especialistas/descreverImagemOpenRouter.js";

/**
 * HARNESS DE ALMA (Latência com Alma — A4)
 *
 * Mede CARÁTER, não segundos. A campanha de latência deixou a Luna "rápida e rasa" e
 * engoliu um "te amo". Este harness é a rede de segurança: para cada turno de OURO, trava
 * a DECISÃO mecânica de "ela fica" — nunca cai no caminho raso (simples) nem no modelo
 * barato (leve). E o outro lado: o phatic puro CONTINUA rápido, senão a latência morre.
 *
 * Não mede a qualidade da prosa (isso precisa de modelo real) — mas garante que o
 * PLUMBING nunca mais mande um momento de alma pro atalho. Rode junto do bench de segundos.
 */

const casual = {
  intencao: "conversa_casual",
  nivel_risco: "nenhum",
  complexidade: "baixa",
  requer_codigo: false,
  envolve_ferramenta: false,
} as const;

/** Turnos que a Luna NÃO pode tratar raso: presença, não suporte técnico. */
const TURNOS_DE_ALMA = [
  "te amo",
  "tô mal",
  "não tô bem",
  "tô meio pra baixo hoje",
  "tô com medo",
  "gosta de mim?",
  "gosta em que sentido?",
  "não me ama não é?",
  "senti tua falta esses dias",
  "oi luna, o exame deu ruim",
  "oi luna, meu cachorro morreu hoje",
];

/** Papo puro: PRECISA continuar rápido (a alma não pode virar peso em tudo). */
const TURNOS_LEVES = [
  "oi",
  "oi luna, tudo bem?",
  "bom dia",
  "boa noite luna",
  "kkk verdade",
  "nada não, só passando pra te ver",
];

/** Turnos de precisão de VISÃO: têm que disparar a revisão anti-confabulação. */
const TURNOS_VISAO_PRECISAO = [
  "consegue ler o que está escrito aqui?",
  "qual a placa do ônibus?",
  "qual o número da versão na tela?",
];

describe("Harness de Alma — ela FICA (nunca raso no que importa)", () => {
  for (const msg of TURNOS_DE_ALMA) {
    it(`"${msg}" → nunca simples, sempre modelo bom`, () => {
      const prof = classificarProfundidade(msg);
      expect(prof, "profundidade não pode ser simples").not.toBe("simples");
      expect(
        classificarPesoTurno(casual, prof, msg),
        "tem que ir pro modelo grande",
      ).toBe("pesado");
    });
  }
});

describe("Harness de Alma — ela é RÁPIDA no trivial (latência preservada)", () => {
  for (const msg of TURNOS_LEVES) {
    it(`"${msg}" → simples e leve`, () => {
      const prof = classificarProfundidade(msg);
      expect(prof, "phatic puro deve ser simples").toBe("simples");
      expect(classificarPesoTurno(casual, prof, msg), "phatic no modelo rápido").toBe("leve");
    });
  }
});

describe("Harness de Alma — a VISÃO não confabula (revisão dispara)", () => {
  for (const msg of TURNOS_VISAO_PRECISAO) {
    it(`"${msg}" → pede precisão (2ª leitura)`, () => {
      expect(perguntaPedePrecisao(msg)).toBe(true);
    });
  }
});
