import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";
import { sqliteFallbackPermitido } from "../../persistencia/modoStore.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";

export type TipoEventoAfetivo = "magoa" | "carinho" | "irritacao" | "desculpas";

export type EventoAfetivo = {
  id: number | string;
  tipo: TipoEventoAfetivo;
  interlocutor_id: string | null;
  narrativa_interna: string;
  intensidade: number;
  criado_em: string;
  expira_em: string;
};

type NovoEventoAfetivo = Omit<EventoAfetivo, "id" | "criado_em" | "expira_em"> & {
  ttlHoras?: number;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

function isoAposHoras(base: Date, horas: number): string {
  return new Date(base.getTime() + horas * 3_600_000).toISOString();
}

export function limparEventosAfetivosExpirados(agora = new Date()): void {
  if (!sqliteFallbackPermitido()) return;
  garantirTabelas();
  obterDb()
    .prepare(`DELETE FROM humor_evento_recente WHERE expira_em <= ?`)
    .run(agora.toISOString());
}

export function registrarEventoAfetivo(evento: NovoEventoAfetivo): void {
  const cache = getCacheMundo();
  if (cache) {
    cache.eventosAfetivosPendentes.push(evento);
    cache.dirty.eventosAfetivos = true;
    const agora = new Date();
    const ttlHoras = evento.ttlHoras ?? 24;
    cache.eventosAfetivosRecentes.unshift({
      id: `pending-${agora.getTime()}`,
      tipo: evento.tipo,
      interlocutor_id: evento.interlocutor_id,
      narrativa_interna: evento.narrativa_interna,
      intensidade: Math.max(0, Math.min(1, evento.intensidade)),
      criado_em: agora.toISOString(),
      expira_em: isoAposHoras(agora, ttlHoras),
    });
    return;
  }

  if (!sqliteFallbackPermitido()) return;

  garantirTabelas();
  limparEventosAfetivosExpirados();
  const agora = new Date();
  const intensidade = Math.max(0, Math.min(1, evento.intensidade));
  const ttlHoras = evento.ttlHoras ?? 24;
  obterDb()
    .prepare(
      `INSERT INTO humor_evento_recente
        (tipo, interlocutor_id, narrativa_interna, intensidade, criado_em, expira_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      evento.tipo,
      evento.interlocutor_id,
      evento.narrativa_interna,
      intensidade,
      agora.toISOString(),
      isoAposHoras(agora, ttlHoras),
    );
}

export function resetarEventosAfetivosParaTeste(): void {
  if (!sqliteFallbackPermitido()) return;
  garantirTabelas();
  obterDb().prepare(`DELETE FROM humor_evento_recente`).run();
}

export function listarEventosAfetivosRecentes(limit = 10): EventoAfetivo[] {
  const cache = getCacheMundo();
  if (cache) {
    const agora = new Date().toISOString();
    return cache.eventosAfetivosRecentes
      .filter((ev) => ev.expira_em > agora)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .slice(0, limit);
  }

  if (!sqliteFallbackPermitido()) return [];
  garantirTabelas();
  limparEventosAfetivosExpirados();
  return obterDb()
    .prepare(
      `SELECT id, tipo, interlocutor_id, narrativa_interna, intensidade, criado_em, expira_em
       FROM humor_evento_recente
       ORDER BY criado_em DESC
       LIMIT ?`,
    )
    .all(limit) as EventoAfetivo[];
}
