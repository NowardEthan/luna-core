import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { getCacheMundo } from "../../persistencia/contextoMundo.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";
import { HUMOR_BASELINE } from "./esquemaHumor.js";

export type ClimaHumor = {
  valencia: number;
  energia: number;
  atualizado_em: string;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

function clampClima(clima: ClimaHumor): ClimaHumor {
  return {
    valencia: Math.max(-1, Math.min(1, clima.valencia)),
    energia: Math.max(0, Math.min(1, clima.energia)),
    atualizado_em: clima.atualizado_em,
  };
}

function aplicarDecaimentoClima(clima: ClimaHumor, agora = new Date()): ClimaHumor {
  const entao = new Date(clima.atualizado_em).getTime();
  const horas = Math.max(0, (agora.getTime() - entao) / 3_600_000);
  const fator = Math.pow(0.5, horas / 12);
  const decair = (valor: number, baseline: number) => baseline + (valor - baseline) * fator;

  return clampClima({
    valencia: decair(clima.valencia, HUMOR_BASELINE.valencia),
    energia: decair(clima.energia, HUMOR_BASELINE.energia),
    atualizado_em: clima.atualizado_em,
  });
}

export function lerClimaGlobal(): ClimaHumor {
  const cache = getCacheMundo();
  if (cache?.clima) {
    return aplicarDecaimentoClima(cache.clima);
  }

  garantirTabelas();
  const row = obterDb()
    .prepare(
      `SELECT valencia, energia, atualizado_em
       FROM humor_clima_global
       WHERE id = 'luna'`,
    )
    .get() as { valencia: number; energia: number; atualizado_em: string } | undefined;

  if (!row) {
    return {
      valencia: HUMOR_BASELINE.valencia,
      energia: HUMOR_BASELINE.energia,
      atualizado_em: new Date().toISOString(),
    };
  }

  return aplicarDecaimentoClima({
    valencia: row.valencia,
    energia: row.energia,
    atualizado_em: row.atualizado_em,
  });
}

export function salvarClimaGlobal(clima: ClimaHumor): ClimaHumor {
  const cache = getCacheMundo();
  const atual = clampClima({ ...clima, atualizado_em: new Date().toISOString() });
  if (cache) {
    cache.clima = atual;
    cache.dirty.clima = true;
    return atual;
  }

  garantirTabelas();
  obterDb()
    .prepare(
      `INSERT INTO humor_clima_global (id, valencia, energia, atualizado_em)
       VALUES ('luna', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         valencia = excluded.valencia,
         energia = excluded.energia,
         atualizado_em = excluded.atualizado_em`,
    )
    .run(atual.valencia, atual.energia, atual.atualizado_em);
  return atual;
}

export function resetarClimaGlobal(): ClimaHumor {
  return salvarClimaGlobal({
    valencia: HUMOR_BASELINE.valencia,
    energia: HUMOR_BASELINE.energia,
    atualizado_em: new Date().toISOString(),
  });
}
