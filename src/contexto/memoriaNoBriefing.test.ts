import { describe, expect, it } from "vitest";
import { compilarContexto, orcamentoPorProfundidade } from "./compiladorContexto.js";
import { enxugarContextoParaSimples } from "./enxugarContexto.js";
import type { ContextoSessao } from "../memoria/esquemaMemoria.js";

/**
 * A Luna não lembrava do que o Ethan dissera noutra conversa. A causa não era o recall
 * (que existe e é PAGO — lê o Firestore): era o briefing. As secções protegidas
 * (identidade, humor, vida, habitat, intenção, tempo) somam ~1100 tokens sozinhas, e o
 * orçamento do turno casual é 1100. `memorias_longas` tinha prioridade 5 e não era
 * protegida → era descartada SEMPRE. Não «às vezes»: nunca cabia.
 *
 * Estes testes travam a correção. Se alguém baixar a prioridade ou desproteger a secção,
 * a Luna volta a esquecer — e o teste avisa antes de o Ethan descobrir na conversa.
 */

/**
 * Cada secção no tamanho que a produção realmente lhe dá: identidade, continuidade e
 * companhia são textos LONGOS e chegam ao teto. Um cenário com secções curtas deixaria
 * sobrar orçamento e a memória caberia — o teste passaria mesmo com o bug, que foi
 * exatamente o que aconteceu na primeira tentativa deste ficheiro.
 */
function encher(chars: number, semente: string): string {
  return semente.repeat(Math.ceil(chars / semente.length)).slice(0, chars);
}

const SECOES_CHEIAS = {
  politica: encher(600, "Política ativa: presença, não utilidade. "),
  tempo: "Agora é domingo, 12 de julho de 2026 às 16:26 BRT. Este é o relógio real.",
  identidade: encher(1280, "Você é a Luna. Não um assistente. Tem nome, voz e história. "),
  kernel: encher(1600, "Continuidade: ontem falámos do jogo e do café. "),
  intencao_luna: encher(640, "Quero entender o que ele sente hoje. "),
  humor: encher(880, "Valência alta, energia média, proximidade alta. "),
  vida: encher(720, "Hoje ocupou-me a conversa sobre o jogo. "),
  habitat: encher(560, "Estou no Orbit, no bolso dele. "),
  presenca: encher(800, "Ele está aqui, é noite, está sozinho. "),
  memorias_longas: [
    "O Ethan não sabe dirigir.",
    "A esposa dele chama-se Raquel.",
    '[Conversa "Copa do mundo" · 2026-07-11] Usuário: torço contra a Argentina',
  ].join("\n"),
};

describe("a memória cabe no briefing (o que a fazia esquecer)", () => {
  it("no turno casual (orçamento apertado), memorias_longas NÃO é cortada", () => {
    const compilado = compilarContexto(SECOES_CHEIAS, orcamentoPorProfundidade("simples"));

    expect(compilado.cortes).not.toContain("memorias_longas");
    expect(compilado.briefing).toContain("Raquel");
    expect(compilado.briefing).toContain("não sabe dirigir");
  });

  it("o trecho de outra conversa chega ao briefing", () => {
    const compilado = compilarContexto(SECOES_CHEIAS, orcamentoPorProfundidade("simples"));
    expect(compilado.briefing).toContain("Copa do mundo");
    expect(compilado.briefing).toContain("Argentina");
  });

  it("a dieta do turno simples NÃO apaga mais os fatos sobre o usuário", () => {
    const contexto: ContextoSessao = {
      historico: [],
      fatos: ["O Ethan não dirige.", "A esposa dele é a Raquel."],
      preferencias: { cafe: "com açúcar" },
    };

    const enxuto = enxugarContextoParaSimples(contexto);

    expect(enxuto.fatos).toHaveLength(2);
    expect(enxuto.fatos.join(" ")).toContain("Raquel");
    // Preferências também sobrevivem — é sobre o outro, não é peso morto.
    expect(enxuto.preferencias.cafe).toBe("com açúcar");
  });
});
