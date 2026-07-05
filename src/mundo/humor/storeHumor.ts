import { obterDb } from "../../memoria/longa/storeSqlite.js";
import {
  aplicarDecaimento,
  clampHumor,
  HUMOR_BASELINE,
  HUMOR_ID,
  type EstadoHumor,
} from "./esquemaHumor.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

export function lerHumor(): EstadoHumor {
  garantirTabelas();
  const row = obterDb()
    .prepare(
      `SELECT valencia, energia, proximidade, atualizado_em FROM humor_estado WHERE id = ?`,
    )
    .get(HUMOR_ID) as
    | { valencia: number; energia: number; proximidade: number; atualizado_em: string }
    | undefined;

  if (!row) {
    return { ...HUMOR_BASELINE, atualizado_em: new Date().toISOString() };
  }

  return aplicarDecaimento(
    clampHumor({
      valencia: row.valencia,
      energia: row.energia,
      proximidade: row.proximidade,
      atualizado_em: row.atualizado_em,
    }),
  );
}

export function salvarHumor(estado: EstadoHumor): void {
  garantirTabelas();
  const e = clampHumor({ ...estado, atualizado_em: new Date().toISOString() });
  obterDb()
    .prepare(
      `INSERT INTO humor_estado (id, valencia, energia, proximidade, atualizado_em)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         valencia = excluded.valencia,
         energia = excluded.energia,
         proximidade = excluded.proximidade,
         atualizado_em = excluded.atualizado_em`,
    )
    .run(HUMOR_ID, e.valencia, e.energia, e.proximidade, e.atualizado_em);
}

export function resetarHumor(): EstadoHumor {
  const baseline = { ...HUMOR_BASELINE, atualizado_em: new Date().toISOString() };
  salvarHumor(baseline);
  return baseline;
}
