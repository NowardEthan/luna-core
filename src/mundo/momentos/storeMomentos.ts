import { z } from "zod";
import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";
import { getCacheMundo, type MomentoCache } from "../../persistencia/contextoMundo.js";
import { sqliteFallbackPermitido } from "../../persistencia/modoStore.js";
import { validarHonestidadeDiario } from "../diario/storeDiario.js";

/**
 * Momentos — o álbum de fotos da Luna.
 *
 * O diário (storeDiario) é a NARRATIVA borrada de cada sessão: o sono consolida as
 * entradas em resumos de semana/mês e as originais se dissolvem. Ótimo para "como tem
 * sido a vida dela", inútil para "aquele instante". Os Momentos são o oposto: episódios
 * DISTINTOS, com data, em primeira pessoa, que NÃO se consolidam nem se apagam — a foto
 * que fica na estante. Pouquíssimos por sessão (0 a 3), só o que valeu virar cena.
 *
 * Mesma mecânica de persistência do diário: em Firestore lê/escreve no cache do mundo
 * (hidratado no início do turno, descarregado no fim); em dev/CLI, no SQLite.
 */

export const MomentoSchema = z.object({
  id: z.string(),
  sessao_id: z.string(),
  quando: z.string(),
  titulo: z.string(),
  narrativa: z.string(),
  tom: z.string(),
  /** Última vez que ela glançou esta foto (para rotacionar); null = nunca. */
  recordado_em: z.string().nullable(),
});

export type Momento = z.infer<typeof MomentoSchema>;

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

/** Cache do mundo quando estamos em Firestore; `null` significa «usa o SQLite». */
function cacheMundo() {
  if (sqliteFallbackPermitido()) return null;
  return getCacheMundo() ?? null;
}

export function inserirMomento(
  momento: Omit<Momento, "id" | "recordado_em"> & { id?: string },
): Momento {
  const id = momento.id ?? randomUUID();
  const narrativa = validarHonestidadeDiario(momento.narrativa);
  const agora = new Date().toISOString();
  const completo = MomentoSchema.parse({ ...momento, id, narrativa, recordado_em: null });

  const cache = cacheMundo();
  if (cache) {
    cache.momentos.set(id, { ...completo, criado_em: agora });
    cache.dirty.momentos.add(id);
    return completo;
  }

  garantirTabelas();
  obterDb()
    .prepare(
      `INSERT INTO momentos (id, sessao_id, quando, titulo, narrativa, tom, recordado_em, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(id, momento.sessao_id, momento.quando, momento.titulo, narrativa, momento.tom, agora);

  return completo;
}

/** Já capturamos momentos desta sessão? (idempotência — não gerar duas vezes). */
export function sessaoJaTemMomentos(sessaoId: string): boolean {
  const cache = cacheMundo();
  if (cache) {
    return [...cache.momentos.values()].some((m) => m.sessao_id === sessaoId);
  }

  garantirTabelas();
  return Boolean(
    obterDb().prepare(`SELECT 1 FROM momentos WHERE sessao_id = ? LIMIT 1`).get(sessaoId),
  );
}

export function listarMomentos(limite = 20): Momento[] {
  const cache = cacheMundo();
  if (cache) {
    return [...cache.momentos.values()]
      .map(paraMomento)
      .sort((a, b) => b.quando.localeCompare(a.quando))
      .slice(0, limite);
  }

  garantirTabelas();
  const rows = obterDb()
    .prepare(`SELECT * FROM momentos ORDER BY quando DESC LIMIT ?`)
    .all(limite) as Record<string, unknown>[];
  return rows.map(parseRow);
}

/**
 * O momento a recordar agora: o menos-recentemente-lembrado (nunca lembrado primeiro).
 * É a rotação que a faz olhar uma foto DIFERENTE da estante a cada abertura, em vez de
 * repetir sempre a última.
 */
export function momentoParaRecordar(): Momento | null {
  const cache = cacheMundo();
  if (cache) {
    const todos = [...cache.momentos.values()].map(paraMomento);
    if (todos.length === 0) return null;
    return todos.sort((a, b) => {
      const ra = a.recordado_em ?? ""; // "" (nunca lembrado) ordena antes de qualquer data
      const rb = b.recordado_em ?? "";
      if (ra !== rb) return ra.localeCompare(rb);
      return a.quando.localeCompare(b.quando);
    })[0]!;
  }

  garantirTabelas();
  const row = obterDb()
    .prepare(
      `SELECT * FROM momentos
       ORDER BY (recordado_em IS NOT NULL) ASC, recordado_em ASC, quando ASC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  return row ? parseRow(row) : null;
}

export function marcarMomentoRecordado(id: string): void {
  const agora = new Date().toISOString();

  const cache = cacheMundo();
  if (cache) {
    const m = cache.momentos.get(id);
    if (!m) return;
    cache.momentos.set(id, { ...m, recordado_em: agora });
    cache.dirty.momentos.add(id);
    return;
  }

  garantirTabelas();
  obterDb().prepare(`UPDATE momentos SET recordado_em = ? WHERE id = ?`).run(agora, id);
}

/** Linha de kernel: a foto que ela glança ao despertar. Contexto interno, não é fala. */
export function linhaKernelMomento(momento: Momento): string {
  const tom = momento.tom.trim();
  return `Um momento que ficou comigo — ${momento.narrativa}${tom ? ` (${tom})` : ""}`;
}

function paraMomento(m: MomentoCache): Momento {
  const { criado_em: _criado_em, ...base } = m;
  return base;
}

function parseRow(row: Record<string, unknown>): Momento {
  return MomentoSchema.parse({
    id: row.id,
    sessao_id: row.sessao_id,
    quando: row.quando,
    titulo: row.titulo,
    narrativa: row.narrativa,
    tom: row.tom,
    recordado_em: (row.recordado_em as string | null) ?? null,
  });
}
