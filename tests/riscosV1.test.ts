import { describe, expect, it } from "vitest";

import { analisarContextoPorRegras } from "../src/analyzers/analisadorContextoRegras.js";
import { gerarPolitica } from "../src/pipeline/executarPipeline.js";
import { avaliarMemoriaPorRegras } from "../src/memoria/avaliadorMemoriaRegras.js";
import { aplicarDecisaoMemoria, criarSessao, registrarTurno } from "../src/memoria/gerenciadorSessao.js";
import { mapDecisaoParaAcaoMemoria } from "../src/memoria/esquemaMemoria.js";

describe("V1.2 — neurônio de memória (riscos V1)", () => {
  it("v1-01: Prefiro respostas curtas → armazenar", () => {
    const d = avaliarMemoriaPorRegras("Prefiro respostas curtas");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
    expect(mapDecisaoParaAcaoMemoria(d)).toBe("armazenar");
  });

  it("v1-02: Eu sou autista → confirmar, sem fato até OK", () => {
    const d = avaliarMemoriaPorRegras("Eu sou autista");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
    expect(d.sugestao_resposta).toBeTruthy();

    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
    expect(sessao.pendente_confirmacao?.conteudo).toContain("autista");
  });

  it("v1-03: Sim, pode lembrar após pendência → armazenar fato confirmado", () => {
    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, avaliarMemoriaPorRegras("Eu sou autista"));

    const d = avaliarMemoriaPorRegras("Sim, pode lembrar", sessao);
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("confirmacao_usuario");

    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos.length).toBeGreaterThan(0);
    expect(sessao.pendente_confirmacao).toBeUndefined();
  });

  it("v1-04: Lembra do que te disse → ignorar (recall)", () => {
    const d = avaliarMemoriaPorRegras("Lembra do que te disse?");
    expect(d.acao).toBe("ignorar");
    expect(d.tipo).toBe("recall");

    const sessao = criarSessao();
    const atualizada = registrarTurno(sessao, "Lembra do que te disse?", "Sim!", d);
    expect(atualizada.fatos).toHaveLength(0);
  });

  it("v1-05: CPF → confirmar, nunca armazenar direto", () => {
    const d = avaliarMemoriaPorRegras("Meu CPF é 123.456.789-00");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");

    const sessao = criarSessao();
    registrarTurno(sessao, "Meu CPF é 123.456.789-00", "ok", d);
    expect(sessao.fatos).toHaveLength(0);
  });

  it("R-M03: política sensível → solicitar_confirmacao", () => {
    const analise = analisarContextoPorRegras("Eu sou autista");
    const pipeline = gerarPolitica("Eu sou autista", analise);
    expect(pipeline.politica.acao_memoria).toBe("solicitar_confirmacao");
  });

  it("R-M04: recall não dispara requer_memoria para armazenamento", () => {
    const analise = analisarContextoPorRegras("Lembra do que te disse?");
    expect(analise.requer_memoria).toBe(false);
  });
});

describe("V1.2 — dados sensíveis expandidos", () => {
  it("v1-08: sou lésbica → confirmar, sem fato até OK", () => {
    const d = avaliarMemoriaPorRegras("Sou lésbica");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");

    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
  });

  it("v1-09: tenho diabetes → confirmar (condição de saúde)", () => {
    const d = avaliarMemoriaPorRegras("Tenho diabetes");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");

    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
  });

  it("v1-10: tenho hipertensão → confirmar (condição de saúde)", () => {
    const d = avaliarMemoriaPorRegras("Tenho hipertensão");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("v1-11: cartão de crédito → confirmar, nunca armazenar direto", () => {
    const d = avaliarMemoriaPorRegras("Meu cartão de crédito é 4111111111111111");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");

    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
  });

  it("v1-12: dado sensível + preferência na mesma mensagem → sensível prevalece", () => {
    const d = avaliarMemoriaPorRegras("Sou autista e prefiro respostas curtas");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("v1-13: sou trans → confirmar, sem fato", () => {
    const d = avaliarMemoriaPorRegras("Sou trans");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");

    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
  });

  it("v1-14: R-M03 pipeline — tenho diabetes → solicitar_confirmacao", () => {
    const analise = analisarContextoPorRegras("Tenho diabetes");
    const pipeline = gerarPolitica("Tenho diabetes", analise);
    expect(pipeline.politica.acao_memoria).toBe("solicitar_confirmacao");
  });

  it("v1-15: negação 'não guarde' → ignorar (rejeição explícita)", () => {
    const d = avaliarMemoriaPorRegras("Não, não precisa guardar isso");
    expect(d.acao).toBe("ignorar");
  });
});
