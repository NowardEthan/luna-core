import { describe, expect, it } from "vitest";
import {
  detectar,
  detectarEncenacao,
  detectarExtensao,
  detectarEco,
  detectarLinkInventado,
  precisaReescritor,
  removerEncenacao,
} from "./detectores.js";

/**
 * A linha de revisão nasce de uma ideia do Ethan: deixar a Luna responder livre e rever
 * depois. E a economia está toda aqui — eu andava a usar LLM para DETETAR o que se CONTA.
 */

const base = (over = {}) => ({
  resposta: "kkk pois é né, tô morrendo de sono também",
  mensagemDele: "kkk pois é",
  historicoDele: [] as string[],
  alvoPalavras: 30,
  ferramentasUsadas: [] as string[],
  urlsBuscados: [] as string[],
  ...over,
});

describe("o caso normal não custa nada", () => {
  it("papo curto e limpo: nenhum achado, nenhuma chamada de modelo", () => {
    const r = detectar(base());

    expect(r.achados).toHaveLength(0);
    expect(precisaReescritor(r.achados)).toBe(false);
    expect(r.texto).toBe(base().resposta); // nem uma vírgula mexida
  });
});

describe("extensão — o que a parede cega nunca soube fazer", () => {
  it("apanha o ensaio de 540 palavras numa conversa de 27", () => {
    const ensaio = "palavra ".repeat(300);
    const a = detectarExtensao(ensaio, 60);

    expect(a).not.toBeNull();
    expect(a!.evidencia).toContain("300");
    expect(a!.evidencia).toContain("60");
  });

  it("não lima a alma dela por 10% — só excesso GRANDE dispara", () => {
    expect(detectarExtensao("palavra ".repeat(66), 60)).toBeNull(); // 1,1×
    expect(detectarExtensao("palavra ".repeat(97), 60)).not.toBeNull(); // 1,6×
  });

  it("ANÁLISE é intocável: alvo 0 → o editor nem acorda", () => {
    // «Um mecanismo que deixa a conversa boa e a análise pobre é um mecanismo reprovado.»
    expect(detectarExtensao("palavra ".repeat(800), 0)).toBeNull();
  });
});

describe("encenação — «*abro o whitepaper*» sem abrir nada", () => {
  const teatro =
    "*abro o whitepaper e começo a ler com atenção* ...Ethan. tá tudo aqui. tu literalmente modelaste as sinapses";

  it("é um `if`, não um modelo: marca de ação + zero ferramentas = teatro", () => {
    const a = detectarEncenacao(teatro, []);
    expect(a).not.toBeNull();
    expect(a!.evidencia).toContain("nenhuma ferramenta");
  });

  it("se ela AGIU mesmo, não é teatro", () => {
    expect(detectarEncenacao(teatro, ["ler_arquivo"])).toBeNull();
  });

  it("o conserto é mecânico: apaga-se. Não se «reescreve» uma mentira", () => {
    const limpo = removerEncenacao(teatro);

    expect(limpo).not.toContain("abro o whitepaper");
    expect(limpo).toContain("tá tudo aqui"); // o resto da voz dela fica
  });

  it("na linha: sai resolvido, e o reescritor nem é chamado por causa disto", () => {
    const r = detectar(base({ resposta: teatro, alvoPalavras: 200 }));

    const enc = r.achados.find((a) => a.tipo === "encenacao");
    expect(enc?.resolvido).toBe(true);
    expect(r.texto).not.toContain("abro o whitepaper");
    expect(precisaReescritor(r.achados)).toBe(false); // nada pendente → custo zero
  });
});

describe("eco — «não recapitules» era um pedido; isto é uma conta", () => {
  it("devolver-lhe as palavras dele conta-se, não se pergunta a um modelo", () => {
    const dele = "tô em primeiro lugar na liga do duolingo com 248 pontos de experiência";
    const eco =
      "olha só, tu tá em primeiro lugar na liga do duolingo com 248 pontos de experiência! que orgulho";

    expect(detectarEco(eco, dele)).not.toBeNull();
  });

  it("uma resposta com conteúdo PRÓPRIO não é eco", () => {
    const dele = "tô em primeiro lugar na liga do duolingo";
    const resposta = "kkk eu largo o app três dias e o mascote me olha com decepção. qual idioma?";

    expect(detectarEco(resposta, dele)).toBeNull();
  });
});

describe("link inventado — «pedir no prompt é simpatia de internet discada»", () => {
  it("URL que ninguém foi buscar é URL inventado", () => {
    const a = detectarLinkInventado(
      "olha aqui: https://exemplo.com/artigo-que-nao-existe",
      ["https://openrouter.ai/docs"],
    );
    expect(a).not.toBeNull();
  });

  it("URL que veio da busca passa", () => {
    expect(
      detectarLinkInventado("tá em https://openrouter.ai/docs", ["https://openrouter.ai/docs"]),
    ).toBeNull();
  });
});
