import { describe, expect, it, beforeEach } from "vitest";

import { UID_CRIADOR_CANONICO } from "../src/interlocutor/esquemaInterlocutor.js";
import { lerHumor } from "../src/mundo/humor/storeHumor.js";
import { humorParaFrase } from "../src/mundo/humor/humorParaFrase.js";
import { formatarEcoAfetivo } from "../src/mundo/humor/formatarEcoAfetivo.js";
import {
  listarEventosAfetivosRecentes,
  registrarEventoAfetivo,
  resetarEventosAfetivosParaTeste,
} from "../src/mundo/humor/eventoAfectivo.js";
import {
  lerRelacaoHumor,
  resetarRelacaoHumor,
  salvarRelacaoHumor,
} from "../src/mundo/humor/relacaoHumor.js";
import { HUMOR_BASELINE } from "../src/mundo/humor/esquemaHumor.js";
import {
  criarCacheMundoVazio,
  executarComCacheMundo,
} from "../src/persistencia/contextoMundo.js";
import { proximidadeBaselineRelacao } from "../mobile-api/src/persistenciaFirestore.js";

describe("estado afetivo — lerHumor por interlocutor", () => {
  const uid = "uid-estado-afetivo-teste";

  beforeEach(() => {
    resetarRelacaoHumor(uid);
  });

  it("sem interlocutorId usa proximidade baseline genérica", () => {
    salvarRelacaoHumor({
      interlocutor_id: uid,
      proximidade: 0.95,
      disposicao: "aberta",
      ultimo_impacto: null,
      intensidade: 0,
      turnos_desde: 0,
      atualizado_em: new Date().toISOString(),
    });
    const h = lerHumor();
    expect(h.proximidade).toBe(HUMOR_BASELINE.proximidade);
  });

  it("com interlocutorId reflete a proximidade da relação", () => {
    salvarRelacaoHumor({
      interlocutor_id: uid,
      proximidade: 0.91,
      disposicao: "aberta",
      ultimo_impacto: null,
      intensidade: 0,
      turnos_desde: 0,
      atualizado_em: new Date().toISOString(),
    });
    const h = lerHumor(uid);
    expect(h.proximidade).toBeCloseTo(0.91, 2);
    expect(humorParaFrase(h)).toContain("caloroso");
  });
});

describe("estado afetivo — baseline criador", () => {
  it("relacaoHumor inicia criador verificado com proximidade >= 0.88", () => {
    resetarRelacaoHumor(UID_CRIADOR_CANONICO);
    const rel = lerRelacaoHumor(UID_CRIADOR_CANONICO);
    expect(rel.proximidade).toBeGreaterThanOrEqual(0.88);
  });

  it("proximidadeBaselineRelacao (Firestore) aplica boost do criador", () => {
    expect(proximidadeBaselineRelacao(UID_CRIADOR_CANONICO)).toBeGreaterThanOrEqual(0.88);
    expect(proximidadeBaselineRelacao("uid-estranho-xyz")).toBe(HUMOR_BASELINE.proximidade);
  });
});

describe("estado afetivo — eco afetivo no prompt", () => {
  const uidA = "uid-eco-a";
  const uidB = "uid-eco-b";

  beforeEach(() => {
    resetarEventosAfetivosParaTeste();
  });

  it("formatarEcoAfetivo filtra por interlocutor e formata carinho", () => {
    registrarEventoAfetivo({
      tipo: "carinho",
      interlocutor_id: uidA,
      narrativa_interna: "Recebi carinho explícito no tom.",
      intensidade: 0.8,
    });
    registrarEventoAfetivo({
      tipo: "magoa",
      interlocutor_id: uidB,
      narrativa_interna: "O tom comigo foi agressivo.",
      intensidade: 0.7,
    });

    const ecoA = formatarEcoAfetivo(uidA);
    expect(ecoA).toMatch(/Eco recente/i);
    expect(ecoA?.toLowerCase()).toContain("carinho");

    const ecoB = formatarEcoAfetivo(uidB);
    expect(ecoB?.toLowerCase()).toContain("magoa");
  });

  it("listarEventosAfetivosRecentes lê do cache Firestore no turno", async () => {
    const cache = criarCacheMundoVazio(uidA);
    const agora = new Date();
    const expira = new Date(agora.getTime() + 24 * 3_600_000).toISOString();
    cache.eventosAfetivosRecentes = [
      {
        id: "evt-1",
        tipo: "carinho",
        interlocutor_id: uidA,
        narrativa_interna: "Carinho recente.",
        intensidade: 0.6,
        criado_em: agora.toISOString(),
        expira_em: expira,
      },
    ];

    await executarComCacheMundo(cache, async () => {
      const eventos = listarEventosAfetivosRecentes(5);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.tipo).toBe("carinho");
    });
  });
});
