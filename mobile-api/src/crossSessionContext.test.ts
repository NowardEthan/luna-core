import { describe, expect, it } from "vitest";
import { __testes } from "./crossSessionContext.js";

const { selecionarRelevantes } = __testes;

/**
 * O bug: os resumos de outras conversas eram escolhidos UMA vez por sessão e cacheados —
 * com as palavras da PRIMEIRA mensagem, que quase sempre é "oi luna" (só stopwords).
 * Quando o Ethan perguntava «lembra do que falei sobre o hebraico?», a busca por hebraico
 * NUNCA acontecia: a Luna já tinha decidido do que lembrar antes de ele perguntar.
 *
 * A correção separa o caro (carregar as conversas) do certo (escolher por pergunta).
 * Estes testes travam a escolha.
 */

const t = (papel: "user" | "assistant", conteudo: string) => ({
  papel,
  conteudo,
  timestamp: "2026-07-11T20:00:00-03:00",
});

const CONVERSAS = [
  {
    id: "c1",
    titulo: "Pastel e router",
    dataLabel: "2026-07-12",
    turnos: [t("user", "comi pastel de presunto e queijo hoje"), t("assistant", "kkk clássico")],
  },
  {
    id: "c2",
    titulo: "Aula de hebraico",
    dataLabel: "2026-07-10",
    turnos: [
      t("user", "me ensina hebraico? quero aprender o alfabeto"),
      t("assistant", "vamos começar pelo alef"),
    ],
  },
  {
    id: "c3",
    titulo: "Copa do mundo",
    dataLabel: "2026-07-11",
    turnos: [t("user", "torço contra a Argentina kk"), t("assistant", "isso é patrimônio cultural")],
  },
];

describe("selecionarRelevantes — a memória escolhida PELA pergunta", () => {
  it("traz a conversa do assunto perguntado, não a mais recente", () => {
    const escolhidas = selecionarRelevantes(CONVERSAS, "lembra do hebraico que a gente viu?", 1);

    expect(escolhidas).toHaveLength(1);
    expect(escolhidas[0]).toContain("Aula de hebraico");
    expect(escolhidas[0]).toContain("alfabeto");
  });

  it("outra pergunta, outra memória — a escolha não fica congelada", () => {
    const escolhidas = selecionarRelevantes(CONVERSAS, "e a Argentina, lembra?", 1);
    expect(escolhidas[0]).toContain("Copa do mundo");
  });

  it("sem pergunta útil (só «oi luna»), cai na conversa mais recente — não em lixo", () => {
    const escolhidas = selecionarRelevantes(CONVERSAS, "oi luna, boa noite", 1);
    expect(escolhidas).toHaveLength(1);
    // Empate de relevância preserva a ordem de entrada (mais recente primeiro).
    expect(escolhidas[0]).toContain("Pastel e router");
  });
});
