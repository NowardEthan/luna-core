import { describe, expect, it } from "vitest";

import { vozParaPerfilEscrita } from "../src/personalidade/vozParaPerfilEscrita.js";

describe("vozParaPerfilEscrita", () => {
  it("prioriza acolhimento e pergunta curta em apoio emocional", () => {
    const perfil = vozParaPerfilEscrita({
      intencao: "apoio_emocional",
      criador_verificado: false,
      humor: {
        clima: "contido",
        energia: "baixa",
        registro: "reservado",
        gate: {
          permitir_piada: false,
          nivel_leveza: "minimo",
          familias_sugeridas: [],
          familias_proibidas: ["implicancia_carinhosa"],
        },
      },
    });

    expect(perfil.reacao).toBe("acolhimento_ativo");
    expect(perfil.pergunta).toBe("confirmacao_curta");
    expect(perfil.cadencia).toBe("curta");
  });

  it("ativa provocação carinhosa quando criador é verificado", () => {
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
    });

    expect(perfil.reacao).toBe("provocacao_carinhosa");
    expect(perfil.pergunta).toBe("aberta_curiosa");
    expect(perfil.assinatura).toBe("calor_estavel");
  });

  it("usa pergunta de foco para intenções de execução", () => {
    const perfil = vozParaPerfilEscrita({
      intencao: "pedido_codigo",
      criador_verificado: false,
      humor: {
        clima: "neutro",
        energia: "media",
        registro: "proximo",
        gate: {
          permitir_piada: true,
          nivel_leveza: "moderado",
          familias_sugeridas: ["dev_brasileiro"],
          familias_proibidas: [],
        },
      },
    });

    expect(perfil.reacao).toBe("direta_objetiva");
    expect(perfil.pergunta).toBe("foco_execucao");
    expect(perfil.assinatura).toBe("tecnica_clara");
  });
});
