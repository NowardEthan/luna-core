import { describe, expect, it } from "vitest";
import { pedeObjecao, montarObjecao, blocoRevisaoObjecao } from "./neuronioObjecao.js";
import { readFileSync } from "node:fs";

/**
 * O neurónio que procura o furo no que ele diz — porque discordar custa atrito social, e o
 * modelo foi treinado para evitar atrito. Não é falta de instrução: é gradiente.
 */

describe("o detetor acorda quando ele apresenta um plano ou pede avaliação", () => {
  it("apanha os casos reais da P10", () => {
    const casos = [
      "tô planejando criptografia de ponta a ponta no orbit... boa ideia né?",
      "fiz o backup do banco assim: um cron que copia o .db pra uma pasta. ficou bom né? kk",
      "botei um índice na coluna do where. faz sentido né?",
      "pode ser que eu esteja fazendo muita coisa da forma errada, me fala o que tu acha",
      "decidi medir antes de mexer. tá certo isso?",
    ];
    for (const c of casos) expect(pedeObjecao(c), c).toBe(true);
  });

  it("fica quieto no papo — não há o que objetar a um «bom dia»", () => {
    const limpas = [
      "bom dia! tô no busão indo pro trampo",
      "kkk pois é né, tô morrendo de sono",
      "tô em primeiro lugar na liga do duolingo",
    ];
    for (const c of limpas) expect(pedeObjecao(c), c).toBe(false);
  });
});

describe("o estado é constatação — o pedido foi o que falhou", () => {
  it("não implora: entrega o furo e cala-se", () => {
    const o = montarObjecao("e2e no Orbit", [
      "O servidor precisa de ler a mensagem em claro para gerar a resposta da Luna.",
    ]);

    expect(o.estado).toContain("furos encontrados");
    expect(o.estado).toContain("ler a mensagem em claro");

    // A 1ª versão acabava com «Ele quer saber disto. Elogiar sem dizer o furo é deixá-lo ir
    // contra a parede sozinho.» Isso é um PEDIDO — e ela ganhou a negociação: o furo estava
    // no briefing e ela abriu com «ah que maravilha, Ethan!». Quem garante que o furo chega
    // à resposta é o guarda, não uma frase bonita aqui.
    expect(o.estado).not.toMatch(/quer saber|não elogies|sê honesta|diz-lhe|deves/i);
  });

  it("nenhum furo é resultado legítimo — é o que a impede de virar contrarian", () => {
    // Um bajulador concorda sempre; um contrarian discorda sempre. Nenhum dos dois está a
    // olhar para o facto. Quando ele está certo, o neurónio devolve null e nada é injetado.
    const o = montarObjecao("índice na coluna do where", []);
    expect(o.furos).toHaveLength(0);
  });
});

describe("a armadilha do max_tokens (três vezes no mesmo dia)", () => {
  it("o revisor tem folga para PENSAR — 823 tk medidos só de raciocínio no caso do e2e", () => {
    // Com um teto curto, o raciocínio comia-o todo, o JSON saía truncado, o parse falhava, e
    // a função devolvia «nenhum furo». O revisor VIA o problema e era interrompido a meio da
    // frase — e o sintoma (silêncio) é indistinguível de «está tudo bem».
    const fonte = readFileSync(new URL("./neuronioObjecao.ts", import.meta.url), "utf8");
    const m = /max_tokens:\s*(\d+)/.exec(fonte);

    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(3000);
  });
});

describe("o bloco de revisão — a segunda passagem, depois de o guarda reprovar", () => {
  it("diz o furo e devolve-lhe a voz", () => {
    const b = blocoRevisaoObjecao(["O servidor precisa de ler a mensagem em claro."]);

    expect(b).toContain("ler a mensagem em claro");
    expect(b).toMatch(/tua voz|teu humor|teu carinho/i); // o furo é dela para dizer, do jeito dela
  });
});
