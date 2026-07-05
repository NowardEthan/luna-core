import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";
import type { EventoVida, TipoEventoVida } from "./eventosVida.js";

export type EventoVidaPersistido = EventoVida & { id: string; criado_em: string };
export type ResumoVidaSemanal = {
  id: string;
  semana_inicio: string;
  semana_fim: string;
  resumo: string;
  intensidade_media: number;
  eventos: string[];
  criado_em: string;
};

export type EstadoVida = {
  fase: "estavel" | "expansao" | "recolhimento" | "integracao";
  energia_narrativa: number;
  foco: string;
  atualizado_em: string;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

function fasePorEvento(tipo: TipoEventoVida): EstadoVida["fase"] {
  if (tipo === "crise") return "recolhimento";
  if (tipo === "insight") return "expansao";
  if (tipo === "conexao") return "integracao";
  return "estavel";
}

export function registrarEventoVida(evento: EventoVida): EventoVidaPersistido {
  garantirTabelas();
  const persistido: EventoVidaPersistido = {
    ...evento,
    id: randomUUID(),
    criado_em: new Date().toISOString(),
  };
  obterDb()
    .prepare(
      `INSERT INTO vida_eventos (id, tipo, narrativa, intensidade, origem, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      persistido.id,
      persistido.tipo,
      persistido.narrativa,
      persistido.intensidade,
      persistido.origem,
      persistido.criado_em,
    );
  return persistido;
}

export function listarEventosVida(limite = 10): EventoVidaPersistido[] {
  garantirTabelas();
  return obterDb()
    .prepare(
      `SELECT id, tipo, narrativa, intensidade, origem, criado_em
       FROM vida_eventos
       ORDER BY criado_em DESC
       LIMIT ?`,
    )
    .all(limite) as EventoVidaPersistido[];
}

export function listarEventosVidaAntigos(corteIso: string): EventoVidaPersistido[] {
  garantirTabelas();
  return obterDb()
    .prepare(
      `SELECT id, tipo, narrativa, intensidade, origem, criado_em
       FROM vida_eventos
       WHERE criado_em < ?
       ORDER BY criado_em ASC`,
    )
    .all(corteIso) as EventoVidaPersistido[];
}

export function lerEstadoVida(): EstadoVida {
  garantirTabelas();
  const row = obterDb()
    .prepare(
      `SELECT fase, energia_narrativa, foco, atualizado_em
       FROM vida_estado
       WHERE id = 'luna'`,
    )
    .get() as EstadoVida | undefined;
  if (row) return row;
  return {
    fase: "estavel",
    energia_narrativa: 0.45,
    foco: "continuidade",
    atualizado_em: new Date().toISOString(),
  };
}

export function atualizarEstadoVida(
  parcial: Partial<Pick<EstadoVida, "fase" | "energia_narrativa" | "foco">>,
): EstadoVida {
  garantirTabelas();
  const atual = lerEstadoVida();
  const proximo: EstadoVida = {
    fase: parcial.fase ?? atual.fase,
    energia_narrativa: Math.max(0, Math.min(1, parcial.energia_narrativa ?? atual.energia_narrativa)),
    foco: parcial.foco?.trim() || atual.foco,
    atualizado_em: new Date().toISOString(),
  };
  obterDb()
    .prepare(
      `INSERT INTO vida_estado (id, fase, energia_narrativa, foco, atualizado_em)
       VALUES ('luna', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        fase = excluded.fase,
        energia_narrativa = excluded.energia_narrativa,
        foco = excluded.foco,
        atualizado_em = excluded.atualizado_em`,
    )
    .run(proximo.fase, proximo.energia_narrativa, proximo.foco, proximo.atualizado_em);
  return proximo;
}

export function inserirResumoVidaSemanal(dados: {
  semana_inicio: string;
  semana_fim: string;
  resumo: string;
  intensidade_media: number;
  eventos: string[];
}): ResumoVidaSemanal {
  garantirTabelas();
  const resumo: ResumoVidaSemanal = {
    id: randomUUID(),
    semana_inicio: dados.semana_inicio,
    semana_fim: dados.semana_fim,
    resumo: dados.resumo.trim(),
    intensidade_media: Math.max(0, Math.min(1, dados.intensidade_media)),
    eventos: dados.eventos,
    criado_em: new Date().toISOString(),
  };
  obterDb()
    .prepare(
      `INSERT INTO vida_resumos_semanais
       (id, semana_inicio, semana_fim, resumo, intensidade_media, eventos_json, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      resumo.id,
      resumo.semana_inicio,
      resumo.semana_fim,
      resumo.resumo,
      resumo.intensidade_media,
      JSON.stringify(resumo.eventos),
      resumo.criado_em,
    );
  return resumo;
}

export function listarResumosVidaSemanais(limite = 12): ResumoVidaSemanal[] {
  garantirTabelas();
  const rows = obterDb()
    .prepare(
      `SELECT id, semana_inicio, semana_fim, resumo, intensidade_media, eventos_json, criado_em
       FROM vida_resumos_semanais
       ORDER BY semana_inicio DESC
       LIMIT ?`,
    )
    .all(limite) as Array<{
    id: string;
    semana_inicio: string;
    semana_fim: string;
    resumo: string;
    intensidade_media: number;
    eventos_json: string;
    criado_em: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    semana_inicio: row.semana_inicio,
    semana_fim: row.semana_fim,
    resumo: row.resumo,
    intensidade_media: row.intensidade_media,
    eventos: JSON.parse(row.eventos_json) as string[],
    criado_em: row.criado_em,
  }));
}

export function removerEventosVida(ids: string[]): void {
  if (ids.length === 0) return;
  garantirTabelas();
  const stmt = obterDb().prepare(`DELETE FROM vida_eventos WHERE id = ?`);
  for (const id of ids) stmt.run(id);
}

export function resetarVidaParaTeste(): void {
  garantirTabelas();
  obterDb().prepare(`DELETE FROM vida_eventos`).run();
  obterDb().prepare(`DELETE FROM vida_estado WHERE id = 'luna'`).run();
  obterDb().prepare(`DELETE FROM vida_resumos_semanais`).run();
}

export function atualizarEstadoComEvento(evento: EventoVida): EstadoVida {
  const fase = fasePorEvento(evento.tipo);
  const foco =
    evento.tipo === "crise"
      ? "acolhimento"
      : evento.tipo === "foco"
        ? "execucao"
        : "continuidade";
  const atual = lerEstadoVida();
  const energia = (atual.energia_narrativa * 0.7) + (evento.intensidade * 0.3);
  return atualizarEstadoVida({ fase, foco, energia_narrativa: energia });
}
