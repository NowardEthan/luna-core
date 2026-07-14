import { describe, expect, it } from "vitest";
import {
  calcularRegistro,
  tendenciaDeProlixidade,
  tetoComRaciocinio,
  RESERVA_RACIOCINIO,
  type EntradaRegistro,
} from "./registroConversa.js";

/**
 * O neurónio de registo responde, com números, às perguntas que o Ethan listou:
 *
 *   «o que esta conversa pede? preciso de me estender? porque me estendo? eu tenho o
 *    costume de ser prolixa? qual é a minha tendência?»
 *
 * Nada disto se pergunta ao modelo. Calcula-se.
 */

const base = (over: Partial<EntradaRegistro> = {}): EntradaRegistro => ({
  mensagemUsuario: "Tô em primeiro lugar na liga do duolingo kkk",
  analise: { intencao: "conversa_casual" },
  profundidade: "simples",
  peso: "leve",
  ...over,
});

describe("«o que esta conversa pede?»", () => {
  it("papo curto dele → resposta curta dela (não 15× mais)", () => {
    const r = calcularRegistro(base());

    expect(r.extensao).toBe("curta");
    expect(r.alvoPalavras).toBeLessThanOrEqual(35);
    expect(r.tetoTokens).toBeGreaterThan(0);
  });

  it("ANÁLISE não leva teto — a resposta longa é a certa ali", () => {
    const r = calcularRegistro(
      base({
        mensagemUsuario: "me explica a diferença entre memória episódica e semântica",
        analise: { intencao: "pergunta_tecnica" },
        peso: "pesado",
      }),
    );

    expect(r.extensao).toBe("longa");
    expect(r.tetoTokens).toBe(0); // 0 = sem parede
    expect(r.diretiva).toBe(""); // e sem diretiva: zero tokens gastos
  });

  it("mensagem longa dele → ela pode falar mais (acompanha o ritmo)", () => {
    const curta = calcularRegistro(base({ mensagemUsuario: "oi" }));
    const longa = calcularRegistro(
      base({
        mensagemUsuario:
          "cara, tô pensando numa parada aqui, sabe quando você olha pro projeto e sente que falta alguma coisa mas não sabe o quê, é meio isso que tá acontecendo comigo hoje",
      }),
    );

    expect(longa.alvoPalavras).toBeGreaterThan(curta.alvoPalavras);
  });
});

describe("profundidade dá FÔLEGO, não isenção (o erro de 14/07)", () => {
  it("uma confissão não é um pedido de ensaio", () => {
    // O turno real: ele escreve 27 palavras sobre a própria vida. Ela devolveu 540.
    // O neurónio isentava-o do teto porque classificava «pesado» → portão aberto.
    const confissao = calcularRegistro(
      base({
        mensagemUsuario:
          "Sinceramente? Nunca trabalhei com isso, nem sei se o que estou fazendo tem alguma coisa de certo kkk, não tenho instrução, sou demasiadamente leigo. Pode ser que eu esteja fazendo muita coisa da forma errada.",
        analise: { intencao: "conversa_casual" },
        peso: "pesado",
        profundidade: "complexo",
      }),
    );

    expect(confissao.tetoTokens).toBeGreaterThan(0); // TEM parede
    expect(confissao.alvoPalavras).toBeLessThanOrEqual(130); // e nunca 540
  });

  it("mas ganha mais espaço que um «bom dia» — densidade merece densidade", () => {
    const leve = calcularRegistro(base({ mensagemUsuario: "kkk pois é né" }));
    const denso = calcularRegistro(
      base({ mensagemUsuario: "kkk pois é né", peso: "pesado", profundidade: "complexo" }),
    );

    expect(denso.alvoPalavras).toBeGreaterThan(leve.alvoPalavras);
  });

  it("o PEDIDO continua a destravar — a análise não pode encolher", () => {
    const pedido = calcularRegistro(
      base({
        mensagemUsuario: "analisa isso pra mim: que problema você vê nesse cache?",
        analise: { intencao: "pergunta_tecnica" },
      }),
    );

    expect(pedido.tetoTokens).toBe(0); // sem parede
  });
});

describe("«eu tenho o costume de ser prolixa? qual é a minha tendência?»", () => {
  it("mede a tendência: quantas vezes mais ela escreve do que ele", () => {
    const historico = [
      { papel: "user" as const, conteudo: "tô em primeiro lugar kkk" }, // 5 palavras
      { papel: "assistant" as const, conteudo: "palavra ".repeat(50) }, // 50 palavras
    ];

    const t = tendenciaDeProlixidade(historico);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(5); // ~10×
  });

  it("HOMEOSTASE: se ela vem prolixa, o alvo encolhe sozinho", () => {
    const prolixa = Array.from({ length: 6 }, () => [
      { papel: "user" as const, conteudo: "kkk é a parte divertida né" },
      { papel: "assistant" as const, conteudo: "palavra ".repeat(120) },
    ]).flat();

    const semHistorico = calcularRegistro(base());
    const comProlixidade = calcularRegistro(base({ historico: prolixa }));

    // O corpo puxa-se de volta — sem ninguém lho pedir no prompt.
    expect(comProlixidade.alvoPalavras).toBeLessThan(semHistorico.alvoPalavras);
    expect(comProlixidade.diretiva).toContain("mais do que ele");
  });

  it("sem histórico, não inventa tendência", () => {
    expect(tendenciaDeProlixidade(undefined)).toBeNull();
    expect(tendenciaDeProlixidade([])).toBeNull();
  });
});

describe("a parede não pode virar mordaça", () => {
  it("o RACIOCÍNIO tem reserva própria — ela pensa à vontade, só DIZ menos", () => {
    // Sem isto, um teto de 80 tokens com o modelo a pensar 200 = resposta VAZIA.
    const comPensar = tetoComRaciocinio(100, true);
    const semPensar = tetoComRaciocinio(100, false);

    expect(semPensar).toBe(100);
    expect(comPensar).toBe(100 + RESERVA_RACIOCINIO);
  });

  it("sem teto continua sem teto (a análise não ganha parede por engano)", () => {
    expect(tetoComRaciocinio(0, true)).toBe(0);
  });
});

describe("a diretiva é MÍNIMA (o sermão de 378 tokens morreu)", () => {
  it("cabe em poucas dezenas de tokens", () => {
    const r = calcularRegistro(base());
    const tokens = Math.ceil(r.diretiva.length / 4);

    expect(tokens).toBeLessThan(60); // o bloco antigo tinha 378
    expect(r.diretiva).toContain("Não recapitules");
  });
});
