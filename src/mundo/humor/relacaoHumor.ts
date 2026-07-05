import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";
import { HUMOR_BASELINE } from "./esquemaHumor.js";

export type DisposicaoRelacao = "aberta" | "reticente" | "fechada";

export type RelacaoHumor = {
  interlocutor_id: string;
  proximidade: number;
  disposicao: DisposicaoRelacao;
  ultimo_impacto: string | null;
  intensidade: number;
  turnos_desde: number;
  atualizado_em: string;
};

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

function clampRelacao(relacao: RelacaoHumor): RelacaoHumor {
  return {
    ...relacao,
    proximidade: Math.max(0, Math.min(1, relacao.proximidade)),
    intensidade: Math.max(0, Math.min(1, relacao.intensidade)),
    turnos_desde: Math.max(0, Math.floor(relacao.turnos_desde)),
  };
}

function inferirDisposicao(proximidade: number, ultimoImpacto: string | null): DisposicaoRelacao {
  if (ultimoImpacto === "magoa" || ultimoImpacto === "irritacao") {
    return proximidade < 0.35 ? "fechada" : "reticente";
  }
  if (proximidade < 0.35) return "reticente";
  return "aberta";
}

function baselineRelacao(interlocutorId: string): RelacaoHumor {
  return {
    interlocutor_id: interlocutorId,
    proximidade: HUMOR_BASELINE.proximidade,
    disposicao: "aberta",
    ultimo_impacto: null,
    intensidade: 0,
    turnos_desde: 0,
    atualizado_em: new Date().toISOString(),
  };
}

export function lerRelacaoHumor(interlocutorId: string | null | undefined): RelacaoHumor {
  if (!interlocutorId) return baselineRelacao("desconhecido");
  garantirTabelas();

  const row = obterDb()
    .prepare(
      `SELECT interlocutor_id, proximidade, disposicao, ultimo_impacto, intensidade, turnos_desde, atualizado_em
       FROM humor_relacao_interlocutor
       WHERE interlocutor_id = ?`,
    )
    .get(interlocutorId) as RelacaoHumor | undefined;

  if (!row) return baselineRelacao(interlocutorId);
  return clampRelacao(row);
}

export function salvarRelacaoHumor(relacao: RelacaoHumor): RelacaoHumor {
  garantirTabelas();
  const atual = clampRelacao({
    ...relacao,
    disposicao: inferirDisposicao(relacao.proximidade, relacao.ultimo_impacto),
    atualizado_em: new Date().toISOString(),
  });

  obterDb()
    .prepare(
      `INSERT INTO humor_relacao_interlocutor
         (interlocutor_id, proximidade, disposicao, ultimo_impacto, intensidade, turnos_desde, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(interlocutor_id) DO UPDATE SET
         proximidade = excluded.proximidade,
         disposicao = excluded.disposicao,
         ultimo_impacto = excluded.ultimo_impacto,
         intensidade = excluded.intensidade,
         turnos_desde = excluded.turnos_desde,
         atualizado_em = excluded.atualizado_em`,
    )
    .run(
      atual.interlocutor_id,
      atual.proximidade,
      atual.disposicao,
      atual.ultimo_impacto,
      atual.intensidade,
      atual.turnos_desde,
      atual.atualizado_em,
    );

  return atual;
}

export function resetarRelacaoHumor(interlocutorId: string): RelacaoHumor {
  const base = baselineRelacao(interlocutorId);
  return salvarRelacaoHumor(base);
}
