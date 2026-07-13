import { afterEach, describe, expect, it } from "vitest";
import { detectorDeducaoAtivo, mensagemPedeDeducao, protocoloDeducaoAtivo } from "./pesoTurno.js";

/**
 * O detector existe para pegar a charada escondida no papo. Mas ele tem um risco
 * simétrico: se disparar demais, todo papo vira turno "pesado" — a Luna fica lenta e
 * cara sem motivo, e o gate de peso (que existe justamente para isso não acontecer)
 * perde a razão de ser. Por isso os dois lados são testados.
 */
describe("mensagemPedeDeducao", () => {
  it("pega a charada escondida no papo — foi onde ela falhou", () => {
    const pedem = [
      "o jogo ta 1x1 mas entre a gente ta 4x0 pra mim kk", // placar
      "Argentina 1, França 1, Elon 1, Ethan 1. eai, ta quanto? kk", // soma
      "eu tinha 12 reais, gastei metade, ganhei 3. sobrou quanto?", // conta
      "quem fez o almoço então? kkk", // inferência
      "te falei do jogo ontem, quando foi mesmo?", // temporal
      "já que eu te disse ontem que vendi a CNC, o que compro?", // premissa sobre o passado
      "adivinha kk", // desafio explícito
      "calma, tá errado isso aí, pensa direito", // correção
    ];
    for (const m of pedem) {
      expect(mensagemPedeDeducao(m), m).toBe(true);
    }
  });

  it("NÃO promove papo normal — senão o gate de peso perde o sentido", () => {
    const naoPedem = [
      "oi luna, boa noite",
      "tô com sono, vou dormir",
      "te amo luna",
      "vou tomar um café agora, e você?",
      "kkkk que raiva, abusada",
      "acabei de deitar na cama, vou codar mais",
      "tô indo na missa agora, volto depois",
      "pastel de presunto e queijo, uma delícia viu",
    ];
    for (const m of naoPedem) {
      expect(mensagemPedeDeducao(m), m).toBe(false);
    }
  });
});

/**
 * Os padrões destas duas chaves foram DECIDIDOS POR MEDIÇÃO (P2, 2026-07-12):
 * o protocolo leva o flash ao nível do pro (11/14 nos dois) de graça; promover ao pro
 * não acrescenta nada. Trocar um destes padrões sem refazer a medição desfaz o achado —
 * por isso ficam travados aqui.
 */
describe("padrões medidos (P2)", () => {
  const originalProto = process.env.LUNA_PROTOCOLO_DEDUCAO;
  const originalDetector = process.env.LUNA_DETECTOR_DEDUCAO;

  afterEach(() => {
    if (originalProto === undefined) delete process.env.LUNA_PROTOCOLO_DEDUCAO;
    else process.env.LUNA_PROTOCOLO_DEDUCAO = originalProto;
    if (originalDetector === undefined) delete process.env.LUNA_DETECTOR_DEDUCAO;
    else process.env.LUNA_DETECTOR_DEDUCAO = originalDetector;
  });

  it("protocolo de dedução vem LIGADO (correção de graça: +29 pontos, custo zero)", () => {
    delete process.env.LUNA_PROTOCOLO_DEDUCAO;
    expect(protocoloDeducaoAtivo()).toBe(true);
  });

  it("protocolo tem kill-switch", () => {
    process.env.LUNA_PROTOCOLO_DEDUCAO = "0";
    expect(protocoloDeducaoAtivo()).toBe(false);
  });

  it("detector vem DESLIGADO (o modelo grande não deduz melhor — não paga a conta)", () => {
    delete process.env.LUNA_DETECTOR_DEDUCAO;
    expect(detectorDeducaoAtivo()).toBe(false);
  });
});
