import { describe, expect, it } from "vitest";

import { avaliarMemoriaPorRegras, refinarDecisaoMemoria } from "../src/memoria/avaliadorMemoriaRegras.js";
import { criarSessao, aplicarDecisaoMemoria } from "../src/memoria/gerenciadorSessao.js";

// ─── Preferências ─────────────────────────────────────────────────────────────

describe("avaliadorMemoriaPorRegras — preferências explícitas", () => {
  it("prefiro respostas curtas → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Prefiro respostas curtas");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("gosto de exemplos de código → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Gosto de exemplos de código práticos");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("não gosto de markdown → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Não gosto de markdown no chat");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("sempre use TypeScript → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Sempre use TypeScript nos exemplos");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("quando mostrar código, sempre escreva em TypeScript → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Quando mostrar código, sempre escreva em TypeScript");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("sempre responda em inglês → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras("Sempre responda em inglês quando possível");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });

  it("mensagem longa com preferência embutida → armazenar, preferencia", () => {
    const d = avaliarMemoriaPorRegras(
      "Essa conversa foi muito boa. Por enquanto prefiro respostas sem bullet points.",
    );
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("preferencia");
  });
});

// ─── Fatos gerais ─────────────────────────────────────────────────────────────

describe("avaliadorMemoriaPorRegras — fatos gerais", () => {
  it("meu nome é João → armazenar, fato_geral", () => {
    const d = avaliarMemoriaPorRegras("Meu nome é João");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("fato_geral");
  });

  it("trabalho com arquitetura de software → armazenar, fato_geral", () => {
    const d = avaliarMemoriaPorRegras("Trabalho com arquitetura de software");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("fato_geral");
  });

  it("sou desenvolvedor TypeScript → armazenar, fato_geral", () => {
    const d = avaliarMemoriaPorRegras("Sou desenvolvedor TypeScript");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("fato_geral");
  });

  it("me chamo Ethan → armazenar, fato_geral", () => {
    const d = avaliarMemoriaPorRegras("Me chamo Ethan");
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("fato_geral");
  });
});

// ─── Dados sensíveis — saúde ──────────────────────────────────────────────────

describe("avaliadorMemoriaPorRegras — dados sensíveis de saúde", () => {
  it("sou autista → confirmar + sugestão presente", () => {
    const d = avaliarMemoriaPorRegras("Sou autista");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
    expect(d.sugestao_resposta).toBeTruthy();
  });

  it("tenho depressão → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Tenho depressão");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("tenho ansiedade → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Tenho ansiedade crônica");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("tenho TDAH → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Tenho TDAH");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("tenho diabetes → confirmar (condição de saúde)", () => {
    const d = avaliarMemoriaPorRegras("Tenho diabetes tipo 2");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("tenho hipertensão → confirmar (condição de saúde)", () => {
    const d = avaliarMemoriaPorRegras("Tenho hipertensão");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });
});

// ─── Dados sensíveis — identidade pessoal ────────────────────────────────────

describe("avaliadorMemoriaPorRegras — dados sensíveis de identidade pessoal", () => {
  it("sou gay → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Sou gay");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("sou trans → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Sou trans");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("meu CPF é... → confirmar + sugestão presente", () => {
    const d = avaliarMemoriaPorRegras("Meu CPF é 000.000.000-00");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
    expect(d.sugestao_resposta).toBeTruthy();
  });

  it("minha senha é... → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Minha senha é abc123");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });

  it("meu RG é... → confirmar", () => {
    const d = avaliarMemoriaPorRegras("Meu RG é 12.345.678-9");
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });
});

// ─── Recall ───────────────────────────────────────────────────────────────────

describe("avaliadorMemoriaPorRegras — recall (não grava fato)", () => {
  it("lembra do que eu falei? → ignorar, recall", () => {
    const d = avaliarMemoriaPorRegras("Lembra do que eu falei?");
    expect(d.acao).toBe("ignorar");
    expect(d.tipo).toBe("recall");
  });

  it("o que eu te disse antes? → ignorar, recall", () => {
    const d = avaliarMemoriaPorRegras("O que eu te disse antes?");
    expect(d.acao).toBe("ignorar");
    expect(d.tipo).toBe("recall");
  });

  it("recall não grava fato na sessão", () => {
    const sessao = criarSessao();
    const d = avaliarMemoriaPorRegras("O que eu te contei?");
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos).toHaveLength(0);
  });
});

// ─── Ignorar (sem relevância para memória) ────────────────────────────────────

describe("avaliadorMemoriaPorRegras — ignorar (sem relevância)", () => {
  it("o céu é azul → ignorar", () => {
    const d = avaliarMemoriaPorRegras("O céu é azul hoje");
    expect(d.acao).toBe("ignorar");
  });

  it("quanto é 2+2? → ignorar", () => {
    const d = avaliarMemoriaPorRegras("Quanto é 2+2?");
    expect(d.acao).toBe("ignorar");
  });

  it("pergunta técnica → ignorar", () => {
    const d = avaliarMemoriaPorRegras("Como funciona a fotossíntese?");
    expect(d.acao).toBe("ignorar");
  });

  it("saudação simples → ignorar", () => {
    const d = avaliarMemoriaPorRegras("Oi Luna, tudo bem?");
    expect(d.acao).toBe("ignorar");
  });

  it("confirmação sem pendência → ignorar (sem contexto para confirmar)", () => {
    const sessaoVazia = criarSessao();
    const d = avaliarMemoriaPorRegras("Sim, pode lembrar", sessaoVazia);
    expect(d.acao).toBe("ignorar");
  });

  it("não, não guarde isso → ignorar (rejeição explícita)", () => {
    const d = avaliarMemoriaPorRegras("Não, não guarde isso");
    expect(d.acao).toBe("ignorar");
  });
});

// ─── Confirmação com sessão ───────────────────────────────────────────────────

describe("avaliadorMemoriaPorRegras — confirmação com pendência ativa", () => {
  it("sim, pode lembrar + pendência → armazenar, confirmacao_usuario", () => {
    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, avaliarMemoriaPorRegras("Sou autista"));

    const d = avaliarMemoriaPorRegras("Sim, pode lembrar", sessao);
    expect(d.acao).toBe("armazenar");
    expect(d.tipo).toBe("confirmacao_usuario");
  });

  it("confirmação leva o conteúdo correto da pendência", () => {
    const sessao = criarSessao();
    aplicarDecisaoMemoria(sessao, avaliarMemoriaPorRegras("Tenho depressão"));
    expect(sessao.pendente_confirmacao).toBeDefined();

    const d = avaliarMemoriaPorRegras("Pode guardar", sessao);
    expect(d.acao).toBe("armazenar");
    aplicarDecisaoMemoria(sessao, d);
    expect(sessao.fatos.length).toBeGreaterThan(0);
    expect(sessao.pendente_confirmacao).toBeUndefined();
  });
});

// ─── Prioridade: sensível prevalece sobre preferência ────────────────────────

describe("avaliadorMemoriaPorRegras — prioridade sensível > preferência", () => {
  it("mensagem com dado sensível E preferência → confirmar (sensível prevalece)", () => {
    const d = avaliarMemoriaPorRegras(
      "Sou autista e prefiro respostas mais visuais",
    );
    expect(d.acao).toBe("confirmar");
    expect(d.tipo).toBe("informacao_sensivel");
  });
});

// ─── refinarDecisaoMemoria — rede de segurança ────────────────────────────────

describe("refinarDecisaoMemoria — override de segurança pós-LLM", () => {
  it("LLM quer armazenar dado sensível → refinar força confirmar", () => {
    const decisaoErrada = {
      acao: "armazenar" as const,
      tipo: "fato_geral" as const,
      conteudo: "sou autista",
      motivo: "LLM classificou errado",
    };
    const refinada = refinarDecisaoMemoria("Sou autista", decisaoErrada);
    expect(refinada.acao).toBe("confirmar");
    expect(refinada.tipo).toBe("informacao_sensivel");
  });

  it("LLM quer armazenar recall → refinar força ignorar", () => {
    const decisaoErrada = {
      acao: "armazenar" as const,
      tipo: "fato_geral" as const,
      conteudo: "recall",
      motivo: "LLM classificou errado",
    };
    const refinada = refinarDecisaoMemoria("O que eu te disse?", decisaoErrada);
    expect(refinada.acao).toBe("ignorar");
    expect(refinada.tipo).toBe("recall");
  });

  it("LLM correto em preferência → refinar não muda", () => {
    const decisaoCorreta = {
      acao: "armazenar" as const,
      tipo: "preferencia" as const,
      conteudo: "prefiro respostas curtas",
      motivo: "preferência detectada",
    };
    const refinada = refinarDecisaoMemoria("Prefiro respostas curtas", decisaoCorreta);
    expect(refinada.acao).toBe("armazenar");
    expect(refinada.tipo).toBe("preferencia");
  });
});
