import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
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
  garantirTabelas();
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

export function listarVontadesAtivas(limite = 10): VontadeNarrativa[] {
  garantirTabelas();
  return obterDb()
    .prepare(
      `SELECT id, sessao_id, vontade, gatilho, prioridade, status, criado_em, atualizado_em
       FROM vontades_narrativas
       WHERE status = 'ativa'
       ORDER BY prioridade DESC, atualizado_em DESC
       LIMIT ?`,
    )
    .all(limite) as VontadeNarrativa[];
}

export function atualizarStatusVontade(
  id: string,
  status: VontadeNarrativa["status"],
): void {
  garantirTabelas();
  obterDb()
    .prepare(`UPDATE vontades_narrativas SET status = ?, atualizado_em = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), id);
}

export function resetarVontadesParaTeste(): void {
  garantirTabelas();
  obterDb().prepare(`DELETE FROM vontades_narrativas`).run();
}
