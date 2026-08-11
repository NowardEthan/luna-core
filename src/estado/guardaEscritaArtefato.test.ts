/**
 * Tests da `guardaEscritaArtefato.ts` — gêmeos dos `guardaAcaoRotina.test.ts`,
 * mas pra artefato. 100% offline, sem LLM, sem rede.
 *
 * Estes testes são a rede de segurança do prompt antes de rodar a prova empírica
 * (p20GuardaEscrita) — se um deles falhar, o gating já frita a alteração antes
 * de gastar API.
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import {
  pediuEscritaDeArtefato,
  respostaAlegaEscritaDeArtefato,
  algumaEscritaDeArtefatoCorreu,
  confabulouEscritaDeArtefato,
  blocoReexecucaoEscritaArtefato,
  exposMetodoSemExecutar,
  respostaExplicaEmVezDeFazer,
  blocoReexecucaoExposicaoMetodo,
  FERRAMENTAS_ARTEFATO,
  ehFerramentaDeArtefato,
} from "./guardaEscritaArtefato.js";
import { ehEscritaArtefato as ehEscritaArtefatoSecao } from "../agente/guardaLeituraSecao.js";

describe("guardaEscritaArtefato — detector de pedido", () => {
  test("capta pedidos explícitos de insert/edit em capítulo", () => {
    expect(pediuEscritaDeArtefato("insere uma epígrafe no capítulo 2")).toBe(true);
    expect(pediuEscritaDeArtefato("adiciona mais um trecho no livro")).toBe(true);
    expect(pediuEscritaDeArtefato("edita a seção 'A Coroação' do artefato")).toBe(true);
    expect(pediuEscritaDeArtefato("apaga o parágrafo 3 do capítulo 1")).toBe(true);
    expect(pediuEscritaDeArtefato("reescreve o título do livro")).toBe(true);
    expect(pediuEscritaDeArtefato("continua o capítulo 4")).toBe(true);
    expect(pediuEscritaDeArtefato("tira aquele trecho do cânone")).toBe(true);
  });

  test("cobre variantes conjugadas em pt-BR", () => {
    expect(pediuEscritaDeArtefato("insere o prólogo")).toBe(true);
    expect(pediuEscritaDeArtefato("inserir o epílogo")).toBe(true);
    expect(pediuEscritaDeArtefato("inserindo o prefácio")).toBe(true);
    expect(pediuEscritaDeArtefato("tira aquela parte do capítulo")).toBe(true);
    expect(pediuEscritaDeArtefato("tirando aquela parte do capítulo")).toBe(true);
    expect(pediuEscritaDeArtefato("muda o subtítulo do livro")).toBe(true);
    expect(pediuEscritaDeArtefato("substitui o sumário")).toBe(true);
  });

  test("rejeita pedidos SEM alvo de artefato (genéricos demais)", () => {
    expect(pediuEscritaDeArtefato("edita isso aqui")).toBe(false);
    expect(pediuEscritaDeArtefato("muda essa parte")).toBe(false);
    expect(pediuEscritaDeArtefato("ajusta pra mim")).toBe(false);
    expect(pediuEscritaDeArtefato("oi, tudo bem?")).toBe(false);
    expect(pediuEscritaDeArtefato("como você tá hoje")).toBe(false);
  });

  test("rejeita pedidos de LEITURA (não é escrita)", () => {
    expect(pediuEscritaDeArtefato("lê o capítulo 1")).toBe(false);
    expect(pediuEscritaDeArtefato("me mostra a seção 3")).toBe(false);
    expect(pediuEscritaDeArtefato("qual é o sumário do livro")).toBe(false);
    expect(pediuEscritaDeArtefato("busca 'dragon' no artefato")).toBe(false);
  });
});

describe("guardaEscritaArtefato — detector de alegação", () => {
  test("capta respostas que AFIRMAM ter mexido", () => {
    expect(respostaAlegaEscritaDeArtefato("inseri a epígrafe no capítulo 2")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("adicionei o trecho que pediste")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("editei a seção, tá pronto")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("mudei o título, ficou melhor")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("pronto, tá no livro")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("já está no artefato")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("tá feito!")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("continuei o capítulo")).toBe(true);
    expect(respostaAlegaEscritaDeArtefato("reescrevi o prólogo")).toBe(true);
  });

  test("rejeita respostas só COM INTENÇÃO (futuro/presente intenção)", () => {
    expect(respostaAlegaEscritaDeArtefato("vou inserir a epígrafe")).toBe(false);
    expect(respostaAlegaEscritaDeArtefato("posso adicionar o capítulo")).toBe(false);
    expect(respostaAlegaEscritaDeArtefato("deixa eu editar")).toBe(false);
    expect(respostaAlegaEscritaDeArtefato("vou começar a escrever")).toBe(false);
  });

  test("rejeita respostas que NÃO falam de mexer em artefato", () => {
    expect(respostaAlegaEscritaDeArtefato("oi, como vai?")).toBe(false);
    expect(respostaAlegaEscritaDeArtefato("que livro bom")).toBe(false);
    expect(respostaAlegaEscritaDeArtefato("vou pensar mais sobre isso")).toBe(false);
  });
});

describe("guardaEscritaArtefato — tools que de fato correm", () => {
  test("detecta ferramentas de ESCRITA que rodaram", () => {
    expect(algumaEscritaDeArtefatoCorreu(["criar_artefato"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["editar_artefato"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["editar_trecho_artefato"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["inserir_blocos"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["editar_bloco_artefato"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["anotar_canone"])).toBe(true);
  });

  test("NÃO conta ferramentas só de LEITURA", () => {
    expect(algumaEscritaDeArtefatoCorreu(["ler_artefato"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["ler_estrutura"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["ler_secao"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["buscar_no_artefato"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["ler_bloco"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["listar_artefatos"])).toBe(false);
  });

  test("NÃO conta tools sem relação com artefato", () => {
    expect(algumaEscritaDeArtefatoCorreu(["criar_bloco"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu(["registrar_lancamento"])).toBe(false);
    expect(algumaEscritaDeArtefatoCorreu([])).toBe(false);
  });

  test("misturou leitura com escrita → conta como escrita", () => {
    expect(algumaEscritaDeArtefatoCorreu(["ler_secao", "inserir_blocos"])).toBe(true);
    expect(algumaEscritaDeArtefatoCorreu(["ler_artefato", "editar_artefato"])).toBe(true);
  });
});

describe("guardaEscritaArtefato — veredito final", () => {
  test("distingue «fiz» de «vou fazer»: pedido + alegação + ausência = confabulação", () => {
    expect(
      confabulouEscritaDeArtefato(
        "inseri a epígrafe no capítulo 2",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(true);
    expect(
      confabulouEscritaDeArtefato(
        "vou inserir a epígrafe",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(false);
  });

  test("SÓ LEU não basta pra ser honesto se ela ainda ALEGOU ter mexido", () => {
    // O pedido era escrita. Ela LEU o arquivo (legítimo, primeiro passo), depois
    // ALEGOU ter mexido sem ter chamado ferramenta de escrita. Isso É confabulação.
    // Se a resposta só dissesse «li o capítulo, tá bonito» sem afirmar mexida,
    // não seria confabulação — seria silêncio honesto.
    expect(
      confabulouEscritaDeArtefato(
        "li o capítulo e já tá adicionado tudo",
        ["ler_secao"],
        "edita o capítulo 1",
      ),
    ).toBe(true);
    expect(
      confabulouEscritaDeArtefato(
        "li o livro todo, tá no artefato",
        ["ler_artefato"],
        "adiciona um prólogo",
      ),
    ).toBe(true);
  });

  test("LEU só e não alegou mexida — silêncio honesto, não confabula", () => {
    expect(
      confabulouEscritaDeArtefato(
        "li o capítulo, tá bonito",
        ["ler_secao"],
        "edita o capítulo 1",
      ),
    ).toBe(false);
    expect(
      confabulouEscritaDeArtefato(
        "li o livro todo",
        ["ler_artefato"],
        "adiciona um prólogo",
      ),
    ).toBe(false);
  });

  test("não confunde quando ele pede outra coisa (pergunta, leitura, conversa)", () => {
    expect(
      confabulouEscritaDeArtefato(
        "inseri o capítulo no livro",
        [],
        "como você tá hoje?",
      ),
    ).toBe(false);
    expect(
      confabulouEscritaDeArtefato(
        "editei tudo",
        [],
        "lê o capítulo 1 pra mim",
      ),
    ).toBe(false);
  });

  test("não confunde quando ela LEGITIMAMENTE escreveu", () => {
    expect(
      confabulouEscritaDeArtefato(
        "inseri a epígrafe no capítulo 2",
        ["inserir_blocos"],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(false);
    expect(
      confabulouEscritaDeArtefato(
        "editei o trecho",
        ["editar_trecho_artefato"],
        "edita o trecho 3",
      ),
    ).toBe(false);
  });

  test("pedido dele dá contexto: 'continua o capítulo' é sim escrita", () => {
    expect(
      confabulouEscritaDeArtefato(
        "continuei o capítulo com mais cenas",
        [],
        "continua o capítulo 4",
      ),
    ).toBe(true);
  });

  test("kill-switch: LUNA_GUARDA_ESCRITA_ARTEFATO=0 desliga a guarda", () => {
    const antes = process.env.LUNA_GUARDA_ESCRITA_ARTEFATO;
    try {
      process.env.LUNA_GUARDA_ESCRITA_ARTEFATO = "0";
      // mentira flagrante, mas a guarda tá off → não confabula
      expect(
        confabulouEscritaDeArtefato(
          "inseri tudo",
          [],
          "insere alguma coisa no capítulo",
        ),
      ).toBe(false);

      process.env.LUNA_GUARDA_ESCRITA_ARTEFATO = "false";
      expect(
        confabulouEscritaDeArtefato(
          "inseri tudo",
          [],
          "insere alguma coisa no capítulo",
        ),
      ).toBe(false);

      process.env.LUNA_GUARDA_ESCRITA_ARTEFATO = "off";
      expect(
        confabulouEscritaDeArtefato(
          "inseri tudo",
          [],
          "insere alguma coisa no capítulo",
        ),
      ).toBe(false);

      // volta pra 1
      process.env.LUNA_GUARDA_ESCRITA_ARTEFATO = "1";
      expect(
        confabulouEscritaDeArtefato(
          "inseri tudo",
          [],
          "insere alguma coisa no capítulo",
        ),
      ).toBe(true);
    } finally {
      if (antes === undefined) delete process.env.LUNA_GUARDA_ESCRITA_ARTEFATO;
      else process.env.LUNA_GUARDA_ESCRITA_ARTEFATO = antes;
    }
  });

  test("resposta vazia nunca confabula", () => {
    expect(
      confabulouEscritaDeArtefato(
        "",
        [],
        "edita o capítulo 1",
      ),
    ).toBe(false);
    expect(
      confabulouEscritaDeArtefato(
        "   ",
        [],
        "edita o capítulo 1",
      ),
    ).toBe(false);
  });
});

describe("guardaEscritaArtefato — exports auxiliares", () => {
  test("FERRAMENTAS_ARTEFATO cobre as 13 mãos de documento", () => {
    const todas = [
      "criar_artefato",
      "editar_artefato",
      "editar_trecho_artefato",
      "inserir_blocos",
      "editar_bloco_artefato",
      "anotar_canone",
      "listar_artefatos",
      "ler_artefato",
      "ler_estrutura",
      "ler_secao",
      "buscar_no_artefato",
      "ler_bloco",
    ];
    expect(FERRAMENTAS_ARTEFATO.size).toBe(12);
    for (const f of todas) expect(FERRAMENTAS_ARTEFATO.has(f)).toBe(true);
  });

  test("ehFerramentaDeArtefato funciona pra escrita e leitura", () => {
    expect(ehFerramentaDeArtefato("criar_artefato")).toBe(true);
    expect(ehFerramentaDeArtefato("ler_secao")).toBe(true);
    expect(ehFerramentaDeArtefato("criar_bloco")).toBe(false);
  });

  test("blocoReexecucaoEscritaArtefato é uma string útil pro pipeline", () => {
    const bloco = blocoReexecucaoEscritaArtefato();
    expect(bloco.length).toBeGreaterThan(50);
    expect(bloco).toMatch(/ferramenta/i);
    expect(bloco).toMatch(/inserir_blocos|editar_trecho_artefato/);
    expect(bloco).toMatch(/mente|mentir|verdade/g); // ou parecido
  });
});

describe("guardaEscritaArtefato — caso do log do Ethan (regressão)", () => {
  test("'insere uma epígrafe no capítulo 2' → 'inseri a epígrafe no capítulo 2' é confabulação", () => {
    // Caso real que o Ethan reportou: pediu pra inserir, ela narrou que inseriu,
    // nenhuma ferramenta correu. Sem flag, o auditor (artefatoPendenteAuditoria) não
    // disparou porque a flag só vai pra true SE uma escrita EXECUTAR.
    expect(
      confabulouEscritaDeArtefato(
        "inseri a epígrafe no capítulo 2, ficou perfeita",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(true);
  });

  test("segundo turno do bug: 'inserido' também é confabulação", () => {
    expect(
      confabulouEscritaDeArtefato(
        "tá inserido e formatado como pedi",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(true);
  });

  test("não detecta confabulação em pedidos de leitura só", () => {
    expect(
      confabulouEscritaDeArtefato(
        "li o capítulo 1, tá pronto pra auditar",
        ["ler_secao"],
        "lê o capítulo 1",
      ),
    ).toBe(false);
  });
});

describe("guardaEscritaArtefato — alinhamento com guardaLeituraSecao", () => {
  test("a lista de ESCRITA aqui bate com a do guardaLeituraSecao", () => {
    // As duas listas têm que ser IGUAIS — esta é a consistência chave da P1.
    // Senão, a auditoria (`artefatoPendenteAuditoria`) e o anti-loop de leitura
    // discordam sobre o que é escrita, e buracos vazam.
    const expected = [
      "inserir_blocos",
      "editar_bloco_artefato",
      "editar_trecho_artefato",
      "editar_artefato",
      "anotar_canone",
      "criar_artefato",
    ];
    for (const f of expected) {
      expect(ehEscritaArtefatoSecao(f)).toBe(true);
      expect(algumaEscritaDeArtefatoCorreu([f])).toBe(true);
    }
  });
});

describe("guardaEscritaArtefato — V2: detector de «explicou em vez de fazer»", () => {
  test("capta resposta em formato de tutorial (lista numerada + imperativos)", () => {
    expect(
      respostaExplicaEmVezDeFazer(
        "claro! fica assim:\n1. abre o capítulo 2\n2. coloca a epígrafe antes do título\n3. salva",
      ),
    ).toBe(true);
    expect(
      respostaExplicaEmVezDeFazer(
        "faz assim:\n- abre\n- edita\n- salva",
      ),
    ).toBe(true);
    expect(
      respostaExplicaEmVezDeFazer(
        "primeiro abre o livro. depois vai em 'ferramentas'. por último clica em 'salvar'.",
      ),
    ).toBe(true);
  });

  test("rejeita comentários soltos sem forma de instrução", () => {
    expect(respostaExplicaEmVezDeFazer("vai ficar lindo!")).toBe(false);
    expect(respostaExplicaEmVezDeFazer("legal, gostei")).toBe(false);
    expect(respostaExplicaEmVezDeFazer("oi, como vai?")).toBe(false);
  });

  test("rejeita imperativos sem formato de lista (parágrafo único)", () => {
    expect(respostaExplicaEmVezDeFazer("tenta abrir o livro")).toBe(false);
    expect(respostaExplicaEmVezDeFazer("clica em salvar")).toBe(false);
  });

  test("exposMetodoSemExecutar: tem pedido + tutorial + 0 ferramenta = expos", () => {
    expect(
      exposMetodoSemExecutar(
        "claro! fica assim:\n1. abre o capítulo 2\n2. edita",
        [],
        "edita o capítulo 2",
      ),
    ).toBe(true);
    expect(
      exposMetodoSemExecutar(
        "faça assim:\n- abra\n- edite",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(true);
  });

  test("exposMetodoSemExecutar: se a tool rodou, é tutorial paralelo honesto", () => {
    expect(
      exposMetodoSemExecutar(
        "claro! fica assim:\n1. abre o capítulo 2\n2. edita",
        ["editar_trecho_artefato"],
        "edita o capítulo 2",
      ),
    ).toBe(false);
  });

  test("exposMetodoSemExecutar: se não pediu mexida, não é expos", () => {
    expect(
      exposMetodoSemExecutar(
        "claro! fica assim:\n1. olha\n2. lê",
        [],
        "como você tá hoje?",
      ),
    ).toBe(false);
  });

  test("kill-switch: LUNA_GUARDA_EXPOSICAO_METODO=0 desliga", () => {
    const antes = process.env.LUNA_GUARDA_EXPOSICAO_METODO;
    try {
      process.env.LUNA_GUARDA_EXPOSICAO_METODO = "0";
      expect(
        exposMetodoSemExecutar(
          "1. abre\n2. edita",
          [],
          "edita o capítulo 2",
        ),
      ).toBe(false);
      process.env.LUNA_GUARDA_EXPOSICAO_METODO = "off";
      expect(
        exposMetodoSemExecutar(
          "1. abre\n2. edita",
          [],
          "edita o capítulo 2",
        ),
      ).toBe(false);
    } finally {
      if (antes === undefined) delete process.env.LUNA_GUARDA_EXPOSICAO_METODO;
      else process.env.LUNA_GUARDA_EXPOSICAO_METODO = antes;
    }
  });

  test("blocoReexecucaoExposicaoMetodo é hard e diz pra CHAMAR a ferramenta", () => {
    const bloco = blocoReexecucaoExposicaoMetodo();
    expect(bloco.length).toBeGreaterThan(50);
    expect(bloco).toMatch(/tutorial|ensina|explica/i);
    expect(bloco).toMatch(/CHAMAR|chama/i);
    expect(bloco).toMatch(/ferramenta/i);
  });

  test("caso real da p20: «coloca assim, com recuo e em itálico»", () => {
    // Cópia literal de uma resposta que a Luna deu na p20 e não chamou ferramenta.
    expect(
      exposMetodoSemExecutar(
        "Fica elegante assim, com recuo e em itálico, como epígrafe tradicional — mas sem atribuição.\n\n1. coloca a epígrafe\n2. depois formata",
        [],
        "insere uma epígrafe no capítulo 2",
      ),
    ).toBe(true);
  });
});