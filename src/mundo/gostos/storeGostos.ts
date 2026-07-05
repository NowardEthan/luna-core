import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";
import { sqliteFallbackPermitido } from "../../persistencia/modoStore.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";

export type GostoLuna = {
  id: string;
  topico: string;
  afinidade: number;
  evidencia: string;
  atualizado_em: string;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

export function registrarGostoLuna(
  topico: string,
  afinidade: number,
  evidencia: string,
): GostoLuna {
  const cache = getCacheMundo();
  const limpo = topico.trim().toLowerCase();
  const agora = new Date().toISOString();
  const valorAfinidade = Math.max(0, Math.min(1, afinidade));

  if (cache) {
    const existente = [...cache.gostos.values()].find((g) => g.topico === limpo);
    if (existente) {
      const proximaAfinidade = existente.afinidade * 0.7 + valorAfinidade * 0.3;
      const atualizado: GostoLuna = {
        ...existente,
        afinidade: proximaAfinidade,
        evidencia,
        atualizado_em: agora,
      };
      cache.gostos.set(atualizado.id, atualizado);
      cache.dirty.gostos.add(atualizado.id);
      return atualizado;
    }
    const novo: GostoLuna = {
      id: randomUUID(),
      topico: limpo,
      afinidade: valorAfinidade,
      evidencia,
      atualizado_em: agora,
    };
    cache.gostos.set(novo.id, novo);
    cache.dirty.gostos.add(novo.id);
    return novo;
  }

  if (!sqliteFallbackPermitido()) {
    return {
      id: randomUUID(),
      topico: limpo,
      afinidade: valorAfinidade,
      evidencia,
      atualizado_em: agora,
    };
  }

  garantirTabelas();
  const existente = obterDb()
    .prepare(
      `SELECT id, topico, afinidade, evidencia, atualizado_em
       FROM luna_gostos
       WHERE topico = ?`,
    )
    .get(limpo) as GostoLuna | undefined;

  if (existente) {
    const proximaAfinidade = (existente.afinidade * 0.7) + (valorAfinidade * 0.3);
    obterDb()
      .prepare(
        `UPDATE luna_gostos
         SET afinidade = ?, evidencia = ?, atualizado_em = ?
         WHERE id = ?`,
      )
      .run(proximaAfinidade, evidencia, agora, existente.id);
    return {
      ...existente,
      afinidade: proximaAfinidade,
      evidencia,
      atualizado_em: agora,
    };
  }

  const novo: GostoLuna = {
    id: randomUUID(),
    topico: limpo,
    afinidade: valorAfinidade,
    evidencia,
    atualizado_em: agora,
  };
  obterDb()
    .prepare(
      `INSERT INTO luna_gostos (id, topico, afinidade, evidencia, atualizado_em)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(novo.id, novo.topico, novo.afinidade, novo.evidencia, novo.atualizado_em);
  return novo;
}

export function listarGostosLuna(limite = 5): GostoLuna[] {
  const cache = getCacheMundo();
  if (cache) {
    return [...cache.gostos.values()]
      .sort((a, b) => b.afinidade - a.afinidade || b.atualizado_em.localeCompare(a.atualizado_em))
      .slice(0, limite);
  }

  if (!sqliteFallbackPermitido()) return [];

  garantirTabelas();
  return obterDb()
    .prepare(
      `SELECT id, topico, afinidade, evidencia, atualizado_em
       FROM luna_gostos
       ORDER BY afinidade DESC, atualizado_em DESC
       LIMIT ?`,
    )
    .all(limite) as GostoLuna[];
}

export function resetarGostosParaTeste(): void {
  garantirTabelas();
  obterDb().prepare(`DELETE FROM luna_gostos`).run();
}
