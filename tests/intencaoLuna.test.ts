import { describe, expect, it, beforeEach } from "vitest";

import {
  climaExigeRecuo,
  intencaoDeterministica,
} from "../src/mundo/intencao/intencaoDeterministica.js";
import { formarIntencaoLuna } from "../src/mundo/intencao/motorIntencao.js";
import { formatarBlocoIntencao } from "../src/mundo/intencao/formatarIntencao.js";
import type { EntradaIntencao } from "../src/mundo/intencao/esquemaIntencao.js";
import { vozParaPerfilEscrita } from "../src/personalidade/vozParaPerfilEscrita.js";
import { resetarVontadesParaTeste } from "../src/mundo/vontade/storeVontade.js";
import { resetarGostosParaTeste } from "../src/mundo/gostos/storeGostos.js";
import { resetarEventosAfetivosParaTeste } from "../src/mundo/humor/eventoAfectivo.js";
import { gerarVontadePosSessao } from "../src/mundo/vontade/geradorVontadePosSessao.js";
import type { MemoriaSessao } from "../src/memoria/esquemaMemoria.js";

function entradaBase(over: Partial<EntradaIntencao> = {}): EntradaIntencao {
  return {
    mensagem: "oi, tudo bem?",
    intencao_usuario: "conversa_casual",
    nivel_risco: "nenhum",
    criador_verificado: true,
    clima: { valencia: 0.5, energia: 0.75 },
    relacao: { proximidade: 0.88, disposicao: "aberta" },
    ...over,
  };
}

describe("Camada de Intenção — leitura de clima", () => {
  it("recua em risco médio+ e em pedidos técnicos", () => {
    expect(climaExigeRecuo(entradaBase({ nivel_risco: "alto" }))).toBe(true);
    expect(climaExigeRecuo(entradaBase({ intencao_usuario: "acao_critica" }))).toBe(true);
    expect(climaExigeRecuo(entradaBase({ intencao_usuario: "pedido_codigo" }))).toBe(true);
    expect(climaExigeRecuo(entradaBase({ clima: { valencia: -0.5, energia: 0.4 } }))).toBe(true);
  });

  it("não recua em conversa casual com clima ok", () => {
    expect(climaExigeRecuo(entradaBase())).toBe(false);
  });
});

describe("Camada de Intenção — determinística", () => {
  beforeEach(() => {
    resetarVontadesParaTeste();
    resetarGostosParaTeste();
    resetarEventosAfetivosParaTeste();
  });

  it("apoio emocional vira cuidar com recuo", () => {
    const i = intencaoDeterministica(
      entradaBase({ intencao_usuario: "apoio_emocional", clima: { valencia: -0.4, energia: 0.3 } }),
    );
    expect(i.tipo).toBe("cuidar");
    expect(i.recuar).toBe(true);
    expect(i.impulso).toBeLessThanOrEqual(0.4);
  });

  it("pedido técnico recua para presença sem empurrar", () => {
    const i = intencaoDeterministica(entradaBase({ intencao_usuario: "pedido_codigo" }));
    expect(i.recuar).toBe(true);
    expect(["so_presenca", "cuidar"]).toContain(i.tipo);
  });

  it("intimidade + energia alta + clima leve pede provocação", () => {
    const i = intencaoDeterministica(entradaBase());
    expect(i.tipo).toBe("provocar");
    expect(i.recuar).toBe(false);
    expect(i.impulso).toBeGreaterThan(0.5);
  });

  it("sem gatilho especial, o padrão é aprofundar (ângulo próprio)", () => {
    const i = intencaoDeterministica(
      entradaBase({ criador_verificado: false, clima: { valencia: 0.2, energia: 0.5 }, relacao: { proximidade: 0.5, disposicao: "aberta" } }),
    );
    expect(i.tipo).toBe("aprofundar");
    expect(i.recuar).toBe(false);
  });
});

describe("Camada de Intenção — motor sem LLM cai em regras", () => {
  beforeEach(() => {
    resetarVontadesParaTeste();
    resetarGostosParaTeste();
    resetarEventosAfetivosParaTeste();
  });

  it("sem provedor, forma intenção por regras", async () => {
    const i = await formarIntencaoLuna(entradaBase());
    expect(i.fonte).toBe("regras");
    expect(i.tipo).toBeTruthy();
  });
});

describe("Camada de Intenção — molda o perfil de escrita", () => {
  it("intenção ativa transforma o 'perguntar' em iniciativa própria", () => {
    const perfil = vozParaPerfilEscrita({
      intencao: "conversa_casual",
      criador_verificado: true,
      humor: {
        clima: "leve",
        energia: "alta",
        registro: "intimo",
        gate: {
          permitir_piada: true,
          nivel_leveza: "alto",
          familias_sugeridas: ["implicancia_carinhosa"],
          familias_proibidas: [],
        },
      },
      intencaoLuna: { tipo: "retomar_fio", impulso: 0.6, recuar: false },
    });
    expect(perfil.pergunta).toBe("iniciativa_propria");
    expect(perfil.reacao).toBe("acolhimento_ativo");
  });

  it("em recuo, volta ao comportamento reativo (não empurra)", () => {
    const perfil = vozParaPerfilEscrita({
      intencao: "apoio_emocional",
      criador_verificado: true,
      humor: {
        clima: "pesado",
        energia: "baixa",
        registro: "caloroso",
        gate: {
          permitir_piada: false,
          nivel_leveza: "minimo",
          familias_sugeridas: [],
          familias_proibidas: ["implicancia_carinhosa"],
        },
      },
      intencaoLuna: { tipo: "cuidar", impulso: 0.3, recuar: true },
    });
    expect(perfil.pergunta).not.toBe("iniciativa_propria");
    expect(perfil.reacao).toBe("acolhimento_ativo");
  });
});

describe("Camada de Intenção — bloco do briefing", () => {
  it("fala em primeira pessoa e como iniciativa quando não recua", () => {
    const bloco = formatarBlocoIntencao({
      tipo: "partilhar",
      foco: "aquele projeto de música",
      impulso: 0.7,
      recuar: false,
      motivo: "quer dividir algo",
      fonte: "regras",
    });
    expect(bloco).toContain("VOCÊ (Luna)");
    expect(bloco.toLowerCase()).toContain("aquele projeto de música");
    expect(bloco.toLowerCase()).toContain("vontade sua");
  });

  it("em recuo, orienta presença/acolhimento", () => {
    const bloco = formatarBlocoIntencao({
      tipo: "so_presenca",
      foco: "",
      impulso: 0.15,
      recuar: true,
      motivo: "momento sensível",
      fonte: "regras",
    });
    expect(bloco.toLowerCase()).toContain("recue");
  });
});

describe("Camada de Intenção — vontade sobre tópico real", () => {
  it("gera vontade citando o assunto substancial da sessão", () => {
    resetarVontadesParaTeste();
    const sessao: MemoriaSessao = {
      id: "sessao-intencao",
      criada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
      mensagens: [
        { papel: "user", conteudo: "oi", timestamp: new Date().toISOString() },
        {
          papel: "user",
          conteudo: "tô montando um setup novo pra gravar minhas músicas em casa",
          timestamp: new Date().toISOString(),
        },
      ],
      fatos: [],
      preferencias: {},
    };
    const vontade = gerarVontadePosSessao(sessao);
    expect(vontade.vontade.toLowerCase()).toContain("gravar minhas músicas");
    expect(vontade.prioridade).toBeGreaterThanOrEqual(4);
  });
});
