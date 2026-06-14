import { describe, expect, it } from "vitest";

import {
  inferirCategoria,
  CATEGORIAS_RELACIONADAS,
  type CategoriaMemoria,
} from "../src/memoria/longa/categorizador.js";

// ─── Hints de tipo (precedência máxima) ──────────────────────────────────────

describe("inferirCategoria — hints de tipo", () => {
  it("tipo='preferencia' → preferencia", () => {
    expect(inferirCategoria("qualquer coisa", "preferencia")).toBe("preferencia");
  });

  it("tipo='informacao_sensivel' → perfil", () => {
    expect(inferirCategoria("tenho diabetes", "informacao_sensivel")).toBe("perfil");
  });

  it("tipo='confirmacao_usuario' → perfil", () => {
    expect(inferirCategoria("sim, pode guardar", "confirmacao_usuario")).toBe("perfil");
  });
});

// ─── Limite ───────────────────────────────────────────────────────────────────

describe("inferirCategoria — limite (precedência mais alta)", () => {
  it("'Não me pergunte sobre família' → limite", () => {
    expect(inferirCategoria("Não me pergunte sobre família")).toBe("limite");
  });

  it("'Nunca mencione isso sem perguntar' → limite", () => {
    expect(inferirCategoria("Nunca mencione isso sem perguntar")).toBe("limite");
  });

  it("'Evite falar sobre religião' → limite", () => {
    expect(inferirCategoria("Evite falar sobre religião")).toBe("limite");
  });
});

// ─── Objetivo ─────────────────────────────────────────────────────────────────

describe("inferirCategoria — objetivo", () => {
  it("'Quero lançar o Luna Desktop' → objetivo", () => {
    expect(inferirCategoria("Quero lançar o Luna Desktop")).toBe("objetivo");
  });

  it("'Meu objetivo é terminar a V1 essa semana' → objetivo", () => {
    expect(inferirCategoria("Meu objetivo é terminar a V1 essa semana")).toBe("objetivo");
  });

  it("'Pretendo publicar o projeto em setembro' → objetivo", () => {
    expect(inferirCategoria("Pretendo publicar o projeto em setembro")).toBe("objetivo");
  });

  it("'Planejo implementar a V2 até junho' → objetivo", () => {
    expect(inferirCategoria("Planejo implementar a V2 até junho")).toBe("objetivo");
  });

  it("'Até a próxima semana quero entregar a versão' → objetivo", () => {
    expect(inferirCategoria("Até a próxima semana quero entregar a versão")).toBe("objetivo");
  });
});

// ─── Preferência ─────────────────────────────────────────────────────────────

describe("inferirCategoria — preferencia", () => {
  it("'Prefiro respostas curtas' → preferencia", () => {
    expect(inferirCategoria("Prefiro respostas curtas")).toBe("preferencia");
  });

  it("'Não gosto de markdown no chat' → preferencia", () => {
    expect(inferirCategoria("Não gosto de markdown no chat")).toBe("preferencia");
  });

  it("'Sempre use TypeScript nos exemplos' → preferencia", () => {
    expect(inferirCategoria("Sempre use TypeScript nos exemplos")).toBe("preferencia");
  });

  it("'Sempre responda em inglês' → preferencia", () => {
    expect(inferirCategoria("Sempre responda em inglês")).toBe("preferencia");
  });
});

// ─── Estado ───────────────────────────────────────────────────────────────────

describe("inferirCategoria — estado (temporário)", () => {
  it("'Estou me sentindo ansioso hoje' → estado", () => {
    expect(inferirCategoria("Estou me sentindo ansioso hoje")).toBe("estado");
  });

  it("'Estou cansado essa semana' → estado", () => {
    expect(inferirCategoria("Estou cansado essa semana")).toBe("estado");
  });

  it("'Estou no meio de uma migração' → estado", () => {
    expect(inferirCategoria("Estou no meio de uma migração")).toBe("estado");
  });

  it("'Estou tentando resolver um bug crítico' → estado", () => {
    expect(inferirCategoria("Estou tentando resolver um bug crítico")).toBe("estado");
  });

  it("'No momento estou sobrecarregado' → estado", () => {
    expect(inferirCategoria("No momento estou sobrecarregado")).toBe("estado");
  });

  it("'Me sinto motivado hoje' → estado", () => {
    expect(inferirCategoria("Me sinto motivado hoje")).toBe("estado");
  });
});

// ─── Contexto técnico ─────────────────────────────────────────────────────────

describe("inferirCategoria — contexto_tecnico", () => {
  it("'Trabalho com TypeScript e Node' → contexto_tecnico", () => {
    expect(inferirCategoria("Trabalho com TypeScript e Node")).toBe("contexto_tecnico");
  });

  it("'Uso Docker para deploy' → contexto_tecnico", () => {
    expect(inferirCategoria("Uso Docker para deploy")).toBe("contexto_tecnico");
  });

  it("'Tenho um bug no backend' → contexto_tecnico", () => {
    expect(inferirCategoria("Tenho um bug no backend")).toBe("contexto_tecnico");
  });

  it("'O projeto usa arquitetura modular' → contexto_tecnico", () => {
    expect(inferirCategoria("O projeto usa arquitetura modular")).toBe("contexto_tecnico");
  });
});

// ─── Perfil ───────────────────────────────────────────────────────────────────

describe("inferirCategoria — perfil (estável)", () => {
  it("'Me chamo Ethan' → perfil", () => {
    expect(inferirCategoria("Me chamo Ethan")).toBe("perfil");
  });

  it("'Sou desenvolvedor' → perfil", () => {
    expect(inferirCategoria("Sou desenvolvedor")).toBe("perfil");
  });

  it("'Tenho ansiedade' → perfil (via tipo hint sensível)", () => {
    expect(inferirCategoria("Tenho ansiedade", "informacao_sensivel")).toBe("perfil");
  });

  it("'Sou autista' → perfil", () => {
    expect(inferirCategoria("Sou autista")).toBe("perfil");
  });

  it("'Moro em São Paulo' → perfil", () => {
    expect(inferirCategoria("Moro em São Paulo")).toBe("perfil");
  });
});

// ─── Distinção objetivo vs perfil vs estado ───────────────────────────────────

describe("inferirCategoria — distinção entre objetivo, perfil e estado", () => {
  it("objetivo é inferido antes do perfil quando há linguagem de meta", () => {
    expect(inferirCategoria("Quero terminar meu projeto TypeScript esse mês")).toBe("objetivo");
  });

  it("estado é inferido antes do perfil quando há linguagem temporal/emocional", () => {
    expect(inferirCategoria("Estou animado com o projeto")).toBe("estado");
  });

  it("perfil captura fatos estáveis sem linguagem de objetivo ou estado", () => {
    expect(inferirCategoria("Sou engenheiro de software")).toBe("perfil");
  });
});

// ─── Contexto cruzado (problema central de V1.7) ────────────────────────────

describe("inferirCategoria — contexto cruzado", () => {
  it("query de debug → contexto_tecnico", () => {
    expect(inferirCategoria("tenho um bug na minha api")).toBe("contexto_tecnico");
  });

  it("query de saúde → perfil", () => {
    expect(inferirCategoria("como minha condição crônica me afeta", "informacao_sensivel")).toBe("perfil");
  });

  it("query de objetivo → objetivo, não técnico", () => {
    expect(inferirCategoria("quero publicar o sistema até dezembro")).toBe("objetivo");
  });
});

// ─── CATEGORIAS_RELACIONADAS ─────────────────────────────────────────────────

describe("CATEGORIAS_RELACIONADAS — fallback inteligente", () => {
  it("todas as 6 categorias têm fallback definido", () => {
    const categorias: CategoriaMemoria[] = [
      "preferencia", "perfil", "estado", "contexto_tecnico", "objetivo", "limite",
    ];
    for (const cat of categorias) {
      expect(CATEGORIAS_RELACIONADAS[cat]).toBeDefined();
      expect(CATEGORIAS_RELACIONADAS[cat]!.length).toBeGreaterThan(0);
    }
  });

  it("objetivo tem fallback para perfil e contexto_tecnico", () => {
    expect(CATEGORIAS_RELACIONADAS["objetivo"]).toContain("perfil");
    expect(CATEGORIAS_RELACIONADAS["objetivo"]).toContain("contexto_tecnico");
  });

  it("estado tem fallback para perfil e objetivo", () => {
    expect(CATEGORIAS_RELACIONADAS["estado"]).toContain("perfil");
    expect(CATEGORIAS_RELACIONADAS["estado"]).toContain("objetivo");
  });

  it("perfil tem fallback para objetivo e estado", () => {
    expect(CATEGORIAS_RELACIONADAS["perfil"]).toContain("objetivo");
    expect(CATEGORIAS_RELACIONADAS["perfil"]).toContain("estado");
  });

  it("nenhuma categoria tem a si mesma como fallback", () => {
    const categorias: CategoriaMemoria[] = [
      "preferencia", "perfil", "estado", "contexto_tecnico", "objetivo", "limite",
    ];
    for (const cat of categorias) {
      expect(CATEGORIAS_RELACIONADAS[cat]).not.toContain(cat);
    }
  });
});
