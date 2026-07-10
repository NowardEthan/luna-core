import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";
import { sqliteFallbackPermitido } from "../../persistencia/modoStore.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";

export type VontadeNarrativa = {
  id: string;
  sessao_id?: string;
  vontade: string;
  gatilho: string;
  prioridade: number;
  status: "ativa" | "concluida" | "arquivada";
  criado_em: string;
  atualizado_em: string;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

export function criarVontadeNarrativa(
  entrada: Pick<VontadeNarrativa, "sessao_id" | "vontade" | "gatilho" | "prioridade">,
): VontadeNarrativa {
  const cache = getCacheMundo();
  const agora = new Date().toISOString();
  const vontade: VontadeNarrativa = {
    id: randomUUID(),
    sessao_id: entrada.sessao_id,
    vontade: entrada.vontade.trim(),
    gatilho: entrada.gatilho.trim(),
    prioridade: Math.max(1, Math.min(5, Math.round(entrada.prioridade))),
    status: "ativa",
    criado_em: agora,
    atualizado_em: agora,
  };

  // Dedupe: a mesma vontade ativa não deve virar linha nova a cada sessão.
  // Sem isto, "Chegar presente e manter continuidade…" acumulou 9+ cópias.
  const chave = vontade.vontade.toLowerCase();
  if (cache) {
    const existente = [...cache.vontades.values()].find(
      (v) => v.status === "ativa" && v.vontade.toLowerCase() === chave,
    );
    if (existente) {
      const atualizado = { ...existente, atualizado_em: agora };
      cache.vontades.set(atualizado.id, atualizado);
      cache.dirty.vontades.add(atualizado.id);
      return atualizado;
    }
    cache.vontades.set(vontade.id, vontade);
    cache.dirty.vontades.add(vontade.id);
    return vontade;
  }

  if (!sqliteFallbackPermitido()) return vontade;

  garantirTabelas();
  const existenteDb = obterDb()
    .prepare(
      `SELECT id, sessao_id, vontade, gatilho, prioridade, status, criado_em, atualizado_em
       FROM vontades_narrativas
       WHERE status = 'ativa' AND lower(vontade) = ? LIMIT 1`,
    )
    .get(chave) as VontadeNarrativa | undefined;
  if (existenteDb) {
    obterDb()
      .prepare(`UPDATE vontades_narrativas SET atualizado_em = ? WHERE id = ?`)
      .run(agora, existenteDb.id);
    return { ...existenteDb, atualizado_em: agora };
  }

  obterDb()
    .prepare(
      `INSERT INTO vontades_narrativas
       (id, sessao_id, vontade, gatilho, prioridade, status, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      vontade.id,
      vontade.sessao_id ?? null,
      vontade.vontade,
      vontade.gatilho,
      vontade.prioridade,
      vontade.status,
      vontade.criado_em,
      vontade.atualizado_em,
    );
  return vontade;
}

/**
 * Vontade é intenção de curto prazo, não compulsão vitalícia. Sem prazo, uma vontade
 * ("puxar o assunto X") era injetada em TODO turno para sempre — a Luna repetia o mesmo
 * assunto meses depois. TTL em dias, configurável por env.
 */
function vontadeTtlDias(): number {
  const raw = process.env.LUNA_VONTADE_TTL_DIAS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 14;
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function cortePorTtl(): string {
  return new Date(Date.now() - vontadeTtlDias() * 24 * 60 * 60 * 1000).toISOString();
}

export function listarVontadesAtivas(limite = 10): VontadeNarrativa[] {
  const corte = cortePorTtl();
  const cache = getCacheMundo();
  if (cache) {
    return [...cache.vontades.values()]
      .filter((v) => v.status === "ativa" && v.criado_em >= corte)
      .sort((a, b) => b.prioridade - a.prioridade || b.atualizado_em.localeCompare(a.atualizado_em))
      .slice(0, limite);
  }

  if (!sqliteFallbackPermitido()) return [];

  garantirTabelas();
  return obterDb()
    .prepare(
      `SELECT id, sessao_id, vontade, gatilho, prioridade, status, criado_em, atualizado_em
       FROM vontades_narrativas
       WHERE status = 'ativa' AND criado_em >= ?
       ORDER BY prioridade DESC, atualizado_em DESC
       LIMIT ?`,
    )
    .all(corte, limite) as VontadeNarrativa[];
}

/**
 * Arquiva vontades de seguimento criadas em sessões ANTERIORES.
 * Sem isto, cada sessão empilhava um "voltar a puxar o assunto X" que nunca se
 * concluía — a Luna repuxava todos os assuntos antigos em toda conversa.
 * A genérica de início de sessão (gatilho `inicio_sessao`) é preservada.
 */
export function arquivarVontadesDeSeguimentoAnteriores(sessaoIdAtual?: string): number {
  const agora = new Date().toISOString();
  const ehSeguimentoAntigo = (v: VontadeNarrativa): boolean =>
    v.status === "ativa" &&
    v.gatilho !== "inicio_sessao" &&
    Boolean(v.sessao_id) &&
    v.sessao_id !== sessaoIdAtual;

  const cache = getCacheMundo();
  if (cache) {
    let n = 0;
    for (const v of [...cache.vontades.values()]) {
      if (!ehSeguimentoAntigo(v)) continue;
      cache.vontades.set(v.id, { ...v, status: "arquivada", atualizado_em: agora });
      cache.dirty.vontades.add(v.id);
      n++;
    }
    return n;
  }

  if (!sqliteFallbackPermitido()) return 0;

  garantirTabelas();
  const res = obterDb()
    .prepare(
      `UPDATE vontades_narrativas
       SET status = 'arquivada', atualizado_em = ?
       WHERE status = 'ativa'
         AND gatilho != 'inicio_sessao'
         AND sessao_id IS NOT NULL
         AND (? IS NULL OR sessao_id != ?)`,
    )
    .run(agora, sessaoIdAtual ?? null, sessaoIdAtual ?? null);
  return res.changes;
}

export function atualizarStatusVontade(
  id: string,
  status: VontadeNarrativa["status"],
): void {
  const cache = getCacheMundo();
  if (cache) {
    const atual = cache.vontades.get(id);
    if (atual) {
      const proximo = { ...atual, status, atualizado_em: new Date().toISOString() };
      cache.vontades.set(id, proximo);
      cache.dirty.vontades.add(id);
    }
    return;
  }

  if (!sqliteFallbackPermitido()) return;

  garantirTabelas();
  obterDb()
    .prepare(`UPDATE vontades_narrativas SET status = ?, atualizado_em = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), id);
}

export function resetarVontadesParaTeste(): void {
  garantirTabelas();
  obterDb().prepare(`DELETE FROM vontades_narrativas`).run();
}
